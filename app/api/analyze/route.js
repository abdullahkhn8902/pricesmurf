import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

export const dynamic = 'force-dynamic';

// Initialize Vertex AI with proper configuration (trim env values)
let vertexAI;
try {
    const PROJECT = (process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7').toString().trim();
    const LOCATION = (process.env.VERTEX_AI_LOCATION || 'us-central1').toString().trim();
    const API_ENDPOINT = `${LOCATION}-aiplatform.googleapis.com`;

    vertexAI = new VertexAI({
        project: PROJECT,
        location: LOCATION,
        apiEndpoint: API_ENDPOINT,
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
        if (contentType && typeof contentType === 'string') {
            if (contentType.toLowerCase().includes('csv')) return true;
            if (contentType.includes('excel') || contentType.includes('spreadsheet')) return false;
        }
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

        // Download file content (kept so we can return preview and store analysis tied to file)
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Process file data (we still parse file for preview/storage but won't send it to Vertex)
        const filename = file.filename || 'unknown';
        const contentType = file.contentType || 'application/octet-stream';
        const { columns, data } = await processFileData(buffer, filename, contentType);

        if (!columns.length || !data.length) {
            return NextResponse.json({ error: 'No valid data found' }, { status: 400 });
        }

        // Ensure vertexAI is initialized; if not, try a minimal late-init
        if (!vertexAI) {
            try {
                vertexAI = new VertexAI({
                    project: VERTEX_AI_PROJECT,
                    location: VERTEX_AI_LOCATION,
                    apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
                });
                console.log('Vertex AI late-init successful');
            } catch (initErr) {
                console.error('Vertex AI late-init error:', initErr);
                throw new Error('Vertex AI not initialized and late-init failed');
            }
        }

        // ---------- MINIMAL CHANGE: Send ONLY the user's prompt to Vertex AI ----------
        if (!customPrompt || !customPrompt.toString().trim()) {
            return NextResponse.json({ error: 'Missing prompt in request body' }, { status: 400 });
        }
        const prompt = customPrompt.toString().trim();

        const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        let result;
        try {
            result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });
            console.log('Vertex AI result (raw):', JSON.stringify(result, null, 2));
        } catch (vErr) {
            console.error('Vertex AI generateContent error:', vErr);
            // Throw to be caught by outer catch and returned as 500 with details
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
        return NextResponse.json({
            error: 'Internal server error',
            details: error?.message || String(error),
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }, { status: 500 });
    } finally {
        await client.close();
    }
}
