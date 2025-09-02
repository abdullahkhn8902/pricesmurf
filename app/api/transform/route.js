import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

// Helper to parse NDJSON (newline-delimited JSON)
function parseNDJSON(text) {
    if (!text || typeof text !== 'string') return [];

    return text
        .split('\n')
        .filter(line => line && line.trim())
        .map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

// Enhanced JSON parsing with multiple fallback strategies
function parseAIResponse(response) {
    // Validate input
    if (typeof response !== 'string') {
        console.error('parseAIResponse: Response is not a string', typeof response);
        throw new Error('Response must be a string');
    }

    // Remove code block markers and trim
    let cleanResponse = response.replace(/```(json)?/g, '').trim();

    // Attempt 1: Parse as complete JSON
    try {
        return JSON.parse(cleanResponse);
    } catch { }

    // Attempt 2: Extract JSON array substring
    const jsonStart = cleanResponse.indexOf('[');
    const jsonEnd = cleanResponse.lastIndexOf(']');
    let candidate = null;

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        candidate = cleanResponse.substring(jsonStart, jsonEnd + 1);
    } else if (jsonStart !== -1) {
        candidate = cleanResponse.substring(jsonStart);
    } else {
        candidate = cleanResponse;
    }

    // Common fixes for malformed JSON
    const attempts = [
        candidate,
        candidate + ']',
        '[' + candidate + ']',
        candidate.replace(/,\s*$/, '') + ']',
        candidate.replace(/,\s*$/, ''),
        candidate.replace(/\]\s*$/, '') + ']',
        candidate.replace(/}\s*$/, '}]'),
    ];

    for (const attempt of attempts) {
        try {
            return JSON.parse(attempt);
        } catch { }
    }

    // Attempt 3: NDJSON parsing (newline-delimited JSON)
    try {
        const lines = cleanResponse.split('\n')
            .map(line => line ? line.trim() : '')
            .filter(line => line && (line.startsWith('{') || line.startsWith('[')));

        // Add null check for lines array
        if (lines && lines.length > 0) {
            // Safe check for first line
            if (lines[0] && typeof lines[0] === 'string' && lines[0].startsWith('[')) {
                const joined = lines.join('').replace(/\]\s*\[/g, ',');
                return JSON.parse(joined);
            }

            // Handle individual objects
            const objects = [];
            for (const line of lines) {
                try {
                    // Add null check for line
                    if (line && typeof line === 'string') {
                        const parsed = JSON.parse(line.replace(/,\s*}$/, '}'));
                        objects.push(parsed);
                    }
                } catch { }
            }
            if (objects.length > 0) return objects;
        }
    } catch { }

    // Attempt 4: Extract JSON objects using regex
    try {
        const jsonObjects = [];
        const objectRegex = /\{[\s\S]*?\}(?=\s*\{|\s*$)/g;
        let match;

        while ((match = objectRegex.exec(cleanResponse)) !== null) {
            try {
                // Add null check for match
                if (match && match[0]) {
                    jsonObjects.push(JSON.parse(match[0]));
                }
            } catch { }
        }

        if (jsonObjects.length > 0) return jsonObjects;
    } catch { }

    // Final attempt: Wrap in array if single object
    try {
        return [JSON.parse(cleanResponse)];
    } catch {
        console.error('JSON parsing failed. Response start:', cleanResponse.substring(0, 500));
        throw new Error('Failed to parse API response');
    }
}

// Column name sanitization
function sanitizeColumnName(name) {
    return (name || '').toString().replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed';
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
        return NextResponse.json(
            { error: 'MONGODB_URI missing in environment variables' },
            { status: 500 }
        );
    }

    if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
        return NextResponse.json(
            { error: 'Vertex AI configuration missing in environment variables' },
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
        const { prompt } = await request.json();

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

        // Initialize Vertex AI with trimmed envs and explicit apiEndpoint
        const vertexAI = new VertexAI({
            project: VERTEX_AI_PROJECT,
            location: VERTEX_AI_LOCATION,
            apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
        });

        // Use Gemini 2.5 Flash Lite model (same approach as other modules)
        const model = vertexAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite"
        });

        // Generate transformation prompt
        const dataString = JSON.stringify({ columns, data }, null, 2);
        const defaultPrompt = `Transform the data according to the user's instructions. 
Output ONLY a valid JSON array of objects representing the transformed data. 
Do not include any explanations or markdown.`;

        const aiPrompt = prompt
            ? `${prompt}\n\nOriginal Data:\n${dataString}\n\n${defaultPrompt}`
            : `${defaultPrompt}\n\nOriginal Data:\n${dataString}`;

        // Vertex AI request
        const vertexRequest = {
            contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
        };

        const result = await model.generateContent(vertexRequest);
        const response = result?.response ?? result;
        const responseText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        // Parse the AI response as JSON data
        let transformedData;
        try {
            transformedData = parseAIResponse(responseText);
            if (!Array.isArray(transformedData)) {
                throw new Error('AI response is not a valid array');
            }
        } catch (parseError) {
            console.error('Transformation parse error:', parseError);
            return NextResponse.json(
                { error: 'Failed to parse transformed data', details: parseError.message },
                { status: 500 }
            );
        }

        // Extract new columns from transformed data
        const newColumns = transformedData.length > 0
            ? Object.keys(transformedData[0]).map(sanitizeColumnName)
            : columns;

        // Update file in database with transformed data
        await db.collection('excelFiles.files').updateOne(
            { _id: new ObjectId(fileId) },
            {
                $set: {
                    'metadata.transformed': true,
                    'metadata.transformedAt': new Date(),
                    'metadata.originalColumns': columns,
                    'metadata.originalDataCount': data.length
                }
            }
        );

        return NextResponse.json({
            columns: newColumns,
            data: transformedData
        }, { status: 200 });

    } catch (error) {
        console.error('Transformation Error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
