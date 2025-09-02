import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

export const dynamic = 'force-dynamic';

// Initialize Vertex AI with proper configuration
let vertexAI;
try {
    vertexAI = new VertexAI({
        project: process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7',
        location: process.env.VERTEX_AI_LOCATION || 'us-central1',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    });
    console.log('Vertex AI initialized successfully');
} catch (error) {
    console.error('Vertex AI initialization error:', error);
}

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
    // trim env vars to avoid trailing-space mismatches
    const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7').toString().trim();
    const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || 'us-central1').toString().trim();

    if (!uri) {
        return NextResponse.json({ error: 'MONGODB_URI missing in environment variables' }, { status: 500 });
    }

    if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
        return NextResponse.json({ error: 'Vertex AI configuration missing in environment variables' }, { status: 500 });
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

        // Process file data (uses your processFileData)
        const filename = file.filename || 'unknown';
        const contentType = file.contentType || 'application/octet-stream';
        const { columns, data } = await processFileData(buffer, filename, contentType);

        if (!columns.length || !data.length) {
            return NextResponse.json({ error: 'No valid data found' }, { status: 400 });
        }

        // Ensure vertexAI is initialized (we trimmed envs above when constructing it earlier)
        if (!vertexAI) {
            // defensive: try initializing here with trimmed values (mirrors your working test)
            try {
                vertexAI = new VertexAI({
                    project: VERTEX_AI_PROJECT,
                    location: VERTEX_AI_LOCATION,
                    apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
                });
                console.log('Vertex AI late-init successful', { project: VERTEX_AI_PROJECT, location: VERTEX_AI_LOCATION });
            } catch (initErr) {
                console.error('Vertex AI late-init error:', initErr);
                throw new Error('Vertex AI not initialized and late-init failed');
            }
        } else {
            console.log('Vertex AI already initialized (POST)', { assumedProject: VERTEX_AI_PROJECT, location: VERTEX_AI_LOCATION });
        }

        // Build prompt
        const dataString = JSON.stringify({ columns, data }, null, 2);
        const defaultPrompt = `Analyze this CRM data and provide insights on customer trends, opportunities, and key patterns. Include actionable recommendations.`;
        const prompt = customPrompt ? `${customPrompt}\n\nData:\n${dataString}` : `${defaultPrompt}\n\nData:\n${dataString}`;

        // --- IMPORTANT: use the same simple strategy that worked in your test handler ---
        const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        // Make the call exactly like your working test route
        let result;
        try {
            result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });
            console.log('Vertex AI result (raw):', JSON.stringify(result, null, 2));
        } catch (vErr) {
            // surface the error with as much detail as possible for debugging
            console.error('Vertex AI generateContent error:', vErr);
            // if it is a permission/403 error, vErr.message will contain details similar to what you pasted
            throw vErr;
        }

        const response = result?.response;
        const analysis = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No analysis generated';

        // Store analysis in DB
        await db.collection('analyses').updateOne(
            { fileId: new ObjectId(fileId), userId },
            { $set: { analysis, updatedAt: new Date() } },
            { upsert: true }
        );

        const sheetName = filename.includes('.') ? filename.split('.')[0] : 'Unnamed Sheet';

        return NextResponse.json({
            sheetName,
            columns,
            data: data.slice(0, 100),
            analysis
        }, { status: 200 });

    } catch (error) {
        console.error('Analysis Error (POST):', error);
        // return and log detailed info to help debug 403
        return NextResponse.json({
            error: 'Internal server error',
            details: error?.message || String(error),
            // expose stack only in development
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }, { status: 500 });
    } finally {
        await client.close();
    }
}

