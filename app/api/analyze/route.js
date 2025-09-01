import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let vertexAI;
let vertexAIInitialized = false;

const initializeVertexAI = () => {
    try {
        // Use environment variables with proper fallbacks
        const projectId = process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7';
        const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

        console.log(`Initializing Vertex AI with project: ${projectId}, location: ${location}`);

        vertexAI = new VertexAI({
            project: projectId,
            location: location,
            apiEndpoint: `${location}-aiplatform.googleapis.com`, // Dynamic endpoint
        });

        vertexAIInitialized = true;
        console.log('Vertex AI initialized successfully');
    } catch (error) {
        console.error('Vertex AI initialization error:', error);
        vertexAIInitialized = false;
    }
};

initializeVertexAI();

async function processFileData(buffer, filename, contentType) {
    let columns = [];
    let data = [];

    const processRow = (row, columns) => {
        return columns.reduce((obj, col, i) => {
            obj[col] = row[i]?.toString()?.trim() || '';
            return obj;
        }, {});
    };

    const isCSV = () => {
        // Safe content type check
        if (contentType && typeof contentType === 'string') {
            if (contentType.toLowerCase().includes('csv')) return true;
            if (contentType.includes('excel') || contentType.includes('spreadsheet')) return false;
        }

        // Safe filename check
        if (filename && typeof filename === 'string') {
            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.csv')) return true;
        }

        return false;
    };

    if (isCSV()) {
        const records = parse(buffer.toString(), {
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });

        const rawHeader = records[0] || [];
        const hasIndexColumn = typeof rawHeader[0] === 'number';
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;

        columns = rawColumns.map(col => {
            const colText = col?.toString()?.trim() || 'Unnamed';
            return colText.replace(/[^a-zA-Z0-9\s_-]/g, '');
        });

        data = records.slice(1).map(row => {
            const processedRow = hasIndexColumn ? row.slice(1) : row;
            return processRow(processedRow, columns);
        });
    } else {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        const rawHeader = jsonData[0] || [];
        const hasIndexColumn = typeof rawHeader[0] === 'number';
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;

        columns = rawColumns.map(col => {
            const colText = col?.toString()?.trim() || 'Unnamed';
            return colText.replace(/[^a-zA-Z0-9\s_-]/g, '');
        });

        data = jsonData.slice(1).map(row => {
            const processedRow = hasIndexColumn ? row.slice(1) : row;
            return processRow(processedRow, columns);
        });
    }

    return { columns, data };
}

export async function POST(request) {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        return NextResponse.json(
            { error: 'MONGODB_URI missing in environment variables' },
            { status: 500 }
        );
    }

    // Reinitialize Vertex AI if not initialized
    if (!vertexAIInitialized) {
        initializeVertexAI();

        if (!vertexAIInitialized) {
            return NextResponse.json(
                { error: 'Vertex AI failed to initialize. Check project ID and permissions.' },
                { status: 500 }
            );
        }
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');
        const { customPrompt } = await request.json();

        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!fileId || !ObjectId.isValid(fileId)) {
            return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
        }

        // Get file metadata
        const filesCollection = db.collection('excelFiles.files');
        const file = await filesCollection.findOne({
            _id: new ObjectId(fileId),
            'metadata.userId': userId
        });

        if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        // Download file content
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Process file data
        const filename = file.filename || 'unknown';
        const contentType = file.contentType || 'application/octet-stream';

        const { columns, data } = await processFileData(
            buffer,
            filename,
            contentType
        );

        if (!columns.length || !data.length) {
            return NextResponse.json({ error: 'No valid data found' }, { status: 400 });
        }

        // Use the model with enhanced configuration
        const model = vertexAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1000,
                topP: 0.8,
            },
        });

        // Generate AI analysis with optimized data size
        const dataForAnalysis = {
            columns,
            data: data.slice(0, 50) // Limit data sent to Vertex AI to prevent overload
        };

        const dataString = JSON.stringify(dataForAnalysis, null, 2);
        const defaultPrompt = `Analyze this CRM data and provide insights on customer trends, 
                        opportunities, and key patterns. Include actionable recommendations.`;

        const prompt = customPrompt
            ? `${customPrompt}\n\nData:\n${dataString}`
            : `${defaultPrompt}\n\nData:\n${dataString}`;

        // Vertex AI request with enhanced error handling
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000); // 45 second timeout

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            }, { signal: controller.signal });

            clearTimeout(timeout);

            const response = result?.response;
            const analysis = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No analysis generated';

            // Store analysis in database
            await db.collection('analyses').updateOne(
                { fileId: new ObjectId(fileId), userId },
                { $set: { analysis, updatedAt: new Date() } },
                { upsert: true }
            );

            // Safe filename splitting
            const sheetName = filename.includes('.')
                ? filename.split('.')[0]
                : 'Unnamed Sheet';

            return NextResponse.json({
                sheetName,
                columns,
                data: data.slice(0, 100), // Return first 100 rows for preview
                analysis
            }, { status: 200 });

        } catch (vertexError) {
            if (vertexError.name === 'AbortError') {
                throw new Error('Vertex AI request timed out after 45 seconds');
            }

            console.error('Vertex AI API Error Details:', {
                message: vertexError.message,
                code: vertexError.code,
                status: vertexError.status,
                details: vertexError.details
            });

            throw new Error(`Vertex AI processing failed: ${vertexError.message}`);
        }

    } catch (error) {
        console.error('Full Analysis Error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        return NextResponse.json(
            {
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Processing failed. Please try again.',
                ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
            },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
