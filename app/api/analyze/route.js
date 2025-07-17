import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

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
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!uri) {
        return NextResponse.json(
            { error: 'MONGODB_URI missing in environment variables' },
            { status: 500 }
        );
    }

    if (!OPENROUTER_API_KEY) {
        return NextResponse.json(
            { error: 'OPENROUTER_API_KEY missing in environment variables' },
            { status: 500 }
        );
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

        // Generate AI analysis
        const dataString = JSON.stringify({ columns, data }, null, 2);
        const defaultPrompt = `Analyze this CRM data and provide insights on customer trends, 
                            opportunities, and key patterns. Include actionable recommendations.`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'AI CRM',
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-r1:free',
                messages: [{
                    role: 'user',
                    content: customPrompt
                        ? `${customPrompt}\n\nData:\n${dataString}`
                        : `${defaultPrompt}\n\nData:\n${dataString}`
                }],
                temperature: 0.7,
                max_tokens: 1000
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('DeepSeek API Error:', errorData);
            return NextResponse.json(
                { error: 'Analysis failed', details: errorData },
                { status: response.status }
            );
        }

        const result = await response.json();
        const analysis = result.choices[0]?.message?.content?.trim() || 'No analysis generated';

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

    } catch (error) {
        console.error('Analysis Error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}