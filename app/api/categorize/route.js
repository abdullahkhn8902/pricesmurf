import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import ExcelJS from 'exceljs';
import { VertexAI } from '@google-cloud/vertexai';

export const dynamic = 'force-dynamic';

// Enhanced JSON parsing for AI responses
function parseAIResponse(response) {
    if (typeof response !== 'string') {
        throw new Error('Response must be a string');
    }

    // Clean the response
    let cleanResponse = response.replace(/```(json)?/g, '').trim();

    // Attempt 1: Direct JSON parsing
    try {
        return JSON.parse(cleanResponse);
    } catch (e) { /* Continue to next attempt */ }

    // Attempt 2: Extract first JSON object
    const jsonStart = cleanResponse.indexOf('{');
    const jsonEnd = cleanResponse.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const candidate = cleanResponse.substring(jsonStart, jsonEnd + 1);
        try {
            return JSON.parse(candidate);
        } catch (e) {
            // Try fixing common syntax issues
            const fixed = candidate
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
                .replace(/'/g, '"');
            try {
                return JSON.parse(fixed);
            } catch (e) {
                throw new Error('Failed to parse AI response: ' + e.message);
            }
        }
    }

    // Attempt 3: Handle wrapped array
    if (cleanResponse.startsWith('[') && cleanResponse.endsWith(']')) {
        try {
            const arr = JSON.parse(cleanResponse);
            if (arr.length > 0 && typeof arr[0] === 'object') {
                return arr[0];
            }
        } catch (e) { /* Ignore */ }
    }

    throw new Error('No valid JSON found in AI response');
}

export async function GET(request) {
    // 1) Auth
    const { userId, getToken } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2) fileId param
    const url = new URL(request.url);
    const fileId = url.searchParams.get('fileId');
    if (!fileId || !ObjectId.isValid(fileId)) {
        return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 });
    }

    // 3) Connect to Mongo
    const uri = process.env.MONGODB_URI;
    const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || '').toString().trim();
    const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || '').toString().trim();

    if (!uri || !VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
        return NextResponse.json(
            { error: 'Missing MONGODB_URI or Vertex AI configuration' },
            { status: 500 }
        );
    }

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('Project0');
    const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

    try {
        // 4) Get file metadata first to check if it's a pricing list
        const file = await db.collection('excelFiles.files').findOne({
            _id: new ObjectId(fileId),
            'metadata.userId': userId,
        });

        if (!file) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        // Check if file is a pricing list
        if (file.metadata?.isPriceList) {
            // Skip AI categorization for pricing lists
            await db.collection('excelFiles.files').updateOne(
                { _id: new ObjectId(fileId), 'metadata.userId': userId },
                {
                    $set: {
                        'metadata.category': 'Price Lists',
                        'metadata.subcategory': 'General'
                    }
                }
            );

            return NextResponse.json(
                {
                    category: 'Price Lists',
                    subcategory: 'General'
                },
                { status: 200 }
            );
        }

        // 5) Download file content only if not a pricing list
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // 6) Parse Excel/CSV
        const workbook = new ExcelJS.Workbook();
        if ((file.filename || '').toLowerCase().endsWith('.csv')) {
            // ExcelJS CSV read expects a stream/string - this preserves your original approach
            await workbook.csv.read(buffer.toString());
        } else {
            await workbook.xlsx.load(buffer);
        }
        const sheet = workbook.worksheets[0];

        // 7) Extract headers & sample rows
        const headers = (sheet.getRow(1).values || []).slice(1).map(String);
        const sampleRows = [];
        for (let i = 2; i <= Math.min(6, sheet.rowCount); i++) {
            sampleRows.push(
                (sheet.getRow(i).values || []).slice(1).map(cell =>
                    cell?.toString?.() || ''
                )
            );
        }

        // Get custom subcategories if available
        let customSubcategories = {};
        try {
            const token = await getToken();
            const requestOrigin = request.headers.get('origin') || new URL(request.url).origin;
            const subcategoriesUrl = `${requestOrigin}/api/subcategories`;

            const subsRes = await fetch(subcategoriesUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (subsRes.ok) {
                const customSubs = await subsRes.json();
                customSubcategories = customSubs.reduce((acc, sub) => {
                    if (!acc[sub.category]) acc[sub.category] = [];
                    acc[sub.category].push(sub.subcategory);
                    return acc;
                }, {});
            }
        } catch (err) {
            console.error('Error fetching subcategories:', err);
        }

        // Enhanced prompt with better categorization logic
        const enhancedPrompt = `You are a data classification expert for PriceSmurf, a pricing optimization platform. 

TASK: Classify this spreadsheet data table into exactly one category and subcategory.

CRITICAL RULES:
1. Return ONLY pure JSON without any additional text, explanations, or markdown
2. Use this exact format: {"category":"Category Name","subcategory":"Subcategory Name"}
3. Choose the most specific subcategory that matches the data
4. If multiple categories could fit, choose based on the PRIMARY purpose of the data

CATEGORIES AND SUBCATEGORIES:
🏢 Company Tables:
  - Products: Product IDs, names, descriptions, SKUs, categories, attributes
  - Customers: Customer IDs, names, segments, demographics, contact info
  - Suppliers: Vendor IDs, names, contact information, performance metrics
  - Employees: Staff data, roles, departments, compensation
  ${customSubcategories['Company Tables'] ? `- Custom: ${customSubcategories['Company Tables'].join(', ')}` : ''}

⚙️ Parameters:
  - Pricing Parameters: Discount rates, markup percentages, price tiers
  - Tax Rates: Tax jurisdictions, rates, rules, exemptions
  - Currency Rates: Exchange rates, conversion factors
  - Cost Structures: Fixed/variable costs, overhead allocations
  ${customSubcategories['Parameters'] ? `- Custom: ${customSubcategories['Parameters'].join(', ')}` : ''}

📅 Transactions:
  - Sales: Invoices, orders, line items, quantities, prices, dates
  - Purchases: Procurement, vendor orders, receipt records
  - Inventory: Stock levels, movements, adjustments, valuations
  - Financial: Payments, receipts, journal entries, accounting records
  ${customSubcategories['Transactions'] ? `- Custom: ${customSubcategories['Transactions'].join(', ')}` : ''}

📊 Analytics:
  - Performance Metrics: KPIs, benchmarks, scorecards, dashboards
  - Market Data: Competitor prices, market trends, industry benchmarks
  - Forecasts: Demand predictions, price projections, sales forecasts
  ${customSubcategories['Analytics'] ? `- Custom: ${customSubcategories['Analytics'].join(', ')}` : ''}

📂 Other Tables:
  - Reference Data: Lookup tables, codes, mappings, configurations
  - Uncategorized: Data that doesn't fit other categories
  ${customSubcategories['Other Tables'] ? `- Custom: ${customSubcategories['Other Tables'].join(', ')}` : ''}

DECISION GUIDELINES:
1. If table contains product identifiers (SKU, ProductID, ItemNo) → Company Tables > Products
2. If table contains customer identifiers (CustomerID, ClientID) → Company Tables > Customers
3. If table contains transaction details (InvoiceNo, OrderID, SaleDate) → Transactions > Sales
4. If table contains pricing parameters (Discount%, Markup, Tier) → Parameters > Pricing Parameters
5. If table contains tax information (TaxRate, Jurisdiction) → Parameters > Tax Rates
6. If table contains inventory movements (StockLevel, Warehouse) → Transactions > Inventory
7. If table contains performance metrics (KPI, Target, Actual) → Analytics > Performance Metrics

DATA TO CLASSIFY:
Filename: ${file.filename}
Columns: ${JSON.stringify(headers)}
Sample Data (first 5 rows):
${sampleRows.map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`).join('\n')}

YOUR RESPONSE (JSON ONLY):`;

        // Initialize Vertex AI (trim envs and explicit apiEndpoint)
        const vertexAI = new VertexAI({
            project: VERTEX_AI_PROJECT,
            location: VERTEX_AI_LOCATION,
            apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
        });

        // Use Gemini 2.5 Flash Lite model with low temperature for deterministic JSON
        const model = vertexAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 200,
            }
        });

        // Vertex AI request
        const vertexRequest = {
            contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
        };

        // 8) Call Vertex AI with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        let result;
        try {
            result = await model.generateContent(vertexRequest, { signal: controller.signal });
            clearTimeout(timeout);
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }

        const response = result?.response ?? result;
        const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (!rawText) {
            throw new Error('AI response is empty');
        }

        console.log('📝 [Categorize API] Raw AI response:', rawText);

        // 9) Parse JSON with robust handling
        let classification;
        try {
            classification = parseAIResponse(rawText);
        } catch (e) {
            console.error('JSON parse error:', e.message);
            console.error('Raw content:', rawText.substring(0, 500));

            // Try a simpler extraction approach
            try {
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    classification = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (secondError) {
                throw new Error('Failed to parse AI response: ' + e.message);
            }
        }

        // Validate classification structure
        if (!classification.category || !classification.subcategory) {
            throw new Error('AI response missing category or subcategory');
        }

        // 10) Persist metadata
        await db.collection('excelFiles.files').updateOne(
            { _id: new ObjectId(fileId), 'metadata.userId': userId },
            {
                $set: {
                    'metadata.category': classification.category,
                    'metadata.subcategory': classification.subcategory,
                    'metadata.categorizedAt': new Date()
                }
            }
        );

        // 11) Return to client
        return NextResponse.json(
            {
                category: classification.category,
                subcategory: classification.subcategory
            },
            { status: 200 }
        );
    } catch (err) {
        console.error('❌ [Categorize API] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Categorization failed' },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
