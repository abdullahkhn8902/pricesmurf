import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import ExcelJS from 'exceljs';

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
    const { userId } = await auth();
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
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!uri || !OPENROUTER_API_KEY) {
        return NextResponse.json(
            { error: 'Missing MONGODB_URI or OPENROUTER_API_KEY' },
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

        // ADDED: Check if file is a pricing list
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
        if (file.filename.toLowerCase().endsWith('.csv')) {
            await workbook.csv.read(buffer.toString());
        } else {
            await workbook.xlsx.load(buffer);
        }
        const sheet = workbook.worksheets[0];

        // 7) Extract headers & sample rows
        const headers = sheet.getRow(1).values.slice(1).map(String);
        const sampleRows = [];
        for (let i = 2; i <= Math.min(4, sheet.rowCount); i++) {
            sampleRows.push(
                sheet.getRow(i).values.slice(1).map(cell =>
                    cell?.toString?.() || ''
                )
            );
        }

        // 8) Build prompt
        const classifyPrompt = `You are part of PriceSmurf.  
Classify this table into exactly one JSON with category & subcategory.

CATEGORIES:
🏢 Company Tables: Products, Customers, Extra Product Info, Extra Customer Info  
⚙️ Parameters: Pricing Parameters, Tax Rates, Other Parameters  
📅 Transactions: Historical Transactions, Other Transactions  
📂 Other Tables: Uncategorized  

Return ONLY JSON with no additional text, e.g.: 
{"category":"Company Tables","subcategory":"Products"}

Columns: ${JSON.stringify(headers)}  
Sample Rows:  
${sampleRows.map(r => JSON.stringify(r)).join('\n')}`;

        // 9) Call AI with robust error handling
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-r1:free',
                messages: [{ role: 'user', content: classifyPrompt }],
                temperature: 0.2,
                max_tokens: 300
            }),
            signal: controller.signal
        }).finally(() => clearTimeout(timeout));

        // Handle API errors
        if (!aiRes.ok) {
            const errorBody = await aiRes.text();
            console.error('OpenRouter API error:', aiRes.status, errorBody);
            throw new Error(`OpenRouter API error: ${aiRes.status}`);
        }

        const aiJson = await aiRes.json();

        // Validate response structure
        if (!aiJson.choices?.[0]?.message?.content) {
            console.error('Invalid OpenRouter response:', JSON.stringify(aiJson, null, 2));
            throw new Error('Invalid response structure from AI service');
        }

        const rawText = aiJson.choices[0].message.content.trim();
        console.log('📝 [Categorize API] Raw AI response:', rawText);

        // 10) Parse JSON with robust handling
        let classification;
        try {
            classification = parseAIResponse(rawText);
        } catch (e) {
            console.error('JSON parse error:', e.message);
            console.error('Raw content:', rawText.substring(0, 500));
            throw new Error('Failed to parse AI response: ' + e.message);
        }

        // Validate classification structure
        if (!classification.category || !classification.subcategory) {
            throw new Error('AI response missing category or subcategory');
        }

        // 11) Persist metadata
        await db.collection('excelFiles.files').updateOne(
            { _id: new ObjectId(fileId), 'metadata.userId': userId },
            {
                $set: {
                    'metadata.category': classification.category,
                    'metadata.subcategory': classification.subcategory
                }
            }
        );

        // 12) Return to client
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