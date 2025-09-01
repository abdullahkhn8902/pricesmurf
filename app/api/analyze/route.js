import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

// Initialize Vertex AI for production
const vertexAI = new VertexAI({
    project: process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7',
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    apiEndpoint: 'us-central1-aiplatform.googleapis.com', // production endpoint
});

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
        if (contentType?.toLowerCase().includes('csv')) return true;
        if (filename?.toLowerCase().endsWith('.csv')) return true;
        return false;
    };

    if (isCSV()) {
        const records = parse(buffer.toString(), { skip_empty_lines: true, trim: true, relax_column_count: true });
        const rawHeader = records[0] || [];
        const hasIndexColumn = typeof rawHeader[0] === 'number';
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;

        columns = rawColumns.map(col => (col?.toString()?.trim() || 'Unnamed').replace(/[^a-zA-Z0-9\s_-]/g, ''));
        data = records.slice(1).map(row => processRow(hasIndexColumn ? row.slice(1) : row, columns));
    } else {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const rawHeader = jsonData[0] || [];
        const hasIndexColumn = typeof rawHeader[0] === 'number';
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;

        columns = rawColumns.map(col => (col?.toString()?.trim() || 'Unnamed').replace(/[^a-zA-Z0-9\s_-]/g, ''));
        data = jsonData.slice(1).map(row => processRow(hasIndexColumn ? row.slice(1) : row, columns));
    }

    return { columns, data };
}

export async function POST(request) {
    const uri = process.env.MONGODB_URI;
    const VERTEX_AI_PROJECT = process.env.VERTEX_AI_PROJECT;
    const VERTEX_AI_LOCATION = process.env.VERTEX_AI_LOCATION;

    if (!uri) return NextResponse.json({ error: 'MONGODB_URI missing' }, { status: 500 });
    if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) return NextResponse.json({ error: 'Vertex AI config missing' }, { status: 500 });

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
        if (!fileId || !ObjectId.isValid(fileId)) return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });

        const filesCollection = db.collection('excelFiles.files');
        const file = await filesCollection.findOne({ _id: new ObjectId(fileId), 'metadata.userId': userId });
        if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        const { columns, data } = await processFileData(buffer, file.filename || 'unknown', file.contentType || 'application/octet-stream');
        if (!columns.length || !data.length) return NextResponse.json({ error: 'No valid data found' }, { status: 400 });

        // Production-ready Vertex AI call
        const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite', generationConfig: { temperature: 0.7, maxOutputTokens: 1000, topP: 0.8 } });
        const dataString = JSON.stringify({ columns, data }, null, 2);
        const prompt = customPrompt
            ? `${customPrompt}\n\nData:\n${dataString}`
            : `Analyze this CRM data and provide insights on customer trends, opportunities, and key patterns. Include actionable recommendations.\n\nData:\n${dataString}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s

        const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }, { signal: controller.signal });
        clearTimeout(timeout);

        const analysis = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No analysis generated';
        await db.collection('analyses').updateOne({ fileId: new ObjectId(fileId), userId }, { $set: { analysis, updatedAt: new Date() } }, { upsert: true });

        const sheetName = (file.filename || 'Unnamed Sheet').split('.')[0];
        return NextResponse.json({ sheetName, columns, data: data.slice(0, 100), analysis }, { status: 200 });

    } catch (error) {
        console.error('Analysis Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message, ...(process.env.NODE_ENV === 'development' && { stack: error.stack }) }, { status: 500 });
    } finally {
        await client.close();
    }
}
