import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

function logEnvironmentDetails() {
    console.log('Environment Details:', {
        NODE_ENV: process.env.NODE_ENV,
        VERTEX_AI_PROJECT: process.env.VERTEX_AI_PROJECT ? 'Set' : 'Not Set',
        VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION ? 'Set' : 'Not Set',
        MONGODB_URI: process.env.MONGODB_URI ? 'Set' : 'Not Set',
        NodeVersion: process.version,
        Platform: process.platform
    });
}


// Initialize Vertex AI with proper configuration
let vertexAI;
try {
    if (!process.env.VERTEX_AI_PROJECT || !process.env.VERTEX_AI_LOCATION) {
        console.warn('Vertex AI environment variables not set during initialization');
    } else {
        vertexAI = new VertexAI({
            project: process.env.VERTEX_AI_PROJECT,
            location: process.env.VERTEX_AI_LOCATION,
            apiEndpoint: `${process.env.VERTEX_AI_LOCATION}-aiplatform.googleapis.com`
        });
        console.log('Vertex AI initialized successfully');
    }
} catch (error) {
    console.error('Vertex AI initialization error:', {
        message: error.message,
        stack: error.stack,
        code: error.code
    });
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
    // Log environment details at the start of the request
    logEnvironmentDetails();

    const uri = process.env.MONGODB_URI;
    const VERTEX_AI_PROJECT = process.env.VERTEX_AI_PROJECT;
    const VERTEX_AI_LOCATION = process.env.VERTEX_AI_LOCATION;

    if (!uri) {
        console.error('MONGODB_URI missing');
        return NextResponse.json(
            { error: 'MONGODB_URI missing in environment variables' },
            { status: 500 }
        );
    }

    if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
        console.error('Vertex AI config missing:', {
            VERTEX_AI_PROJECT: VERTEX_AI_PROJECT,
            VERTEX_AI_LOCATION: VERTEX_AI_LOCATION
        });
        return NextResponse.json(
            { error: 'Vertex AI configuration missing in environment variables' },
            { status: 500 }
        );
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('MongoDB connected successfully');

        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');
        const { customPrompt } = await request.json();

        console.log('Request parameters:', { fileId, hasCustomPrompt: !!customPrompt });

        const { userId } = await auth();
        if (!userId) {
            console.error('Unauthorized access attempt');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!fileId || !ObjectId.isValid(fileId)) {
            console.error('Invalid file ID:', fileId);
            return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
        }

        // Get file metadata
        const filesCollection = db.collection('excelFiles.files');
        const file = await filesCollection.findOne({
            _id: new ObjectId(fileId),
            'metadata.userId': userId
        });

        if (!file) {
            console.error('File not found:', fileId);
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        console.log('File found:', { filename: file.filename, size: file.length });

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

        console.log('File processed:', { columns: columns.length, rows: data.length });

        if (!columns.length || !data.length) {
            console.error('No valid data found in file');
            return NextResponse.json({ error: 'No valid data found' }, { status: 400 });
        }

        // Reinitialize Vertex AI if needed (for serverless environments)
        let vertexAIInstance = vertexAI;
        if (!vertexAIInstance) {
            console.log('Reinitializing Vertex AI');
            try {
                vertexAIInstance = new VertexAI({
                    project: VERTEX_AI_PROJECT,
                    location: VERTEX_AI_LOCATION,
                    apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`
                });
            } catch (error) {
                console.error('Vertex AI reinitialization failed:', error);
                throw new Error('Vertex AI initialization failed: ' + error.message);
            }
        }

        // Try multiple model names with fallback
        const modelNames = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-001",
            "gemini-1.0-pro"
        ];

        let model;
        let modelError;

        for (const modelName of modelNames) {
            try {
                console.log('Trying model:', modelName);
                model = vertexAIInstance.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 1000,
                        topP: 0.8,
                    },
                });

                // Test with a simple request
                const testResult = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: "Hello" }] }],
                });

                console.log('Model test successful:', modelName);
                break; // Exit loop if successful
            } catch (error) {
                modelError = error;
                console.warn(`Model ${modelName} failed:`, error.message);
            }
        }

        if (!model) {
            console.error('All model attempts failed:', modelError);
            throw new Error(`All model attempts failed: ${modelError.message}`);
        }

        // Generate AI analysis
        const dataString = JSON.stringify({ columns, data: data.slice(0, 10) }, null, 2); // Only send first 10 rows to reduce token usage
        const defaultPrompt = `Analyze this CRM data and provide insights on customer trends, 
                          opportunities, and key patterns. Include actionable recommendations.`;

        const prompt = customPrompt
            ? `${customPrompt}\n\nData:\n${dataString}`
            : `${defaultPrompt}\n\nData:\n${dataString}`;

        console.log('Sending request to Vertex AI with prompt length:', prompt.length);

        // Vertex AI request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000); // 45 second timeout

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            }, { signal: controller.signal });

            clearTimeout(timeout);

            const response = result?.response;
            const analysis = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No analysis generated';

            console.log('Vertex AI response received, analysis length:', analysis.length);

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
            clearTimeout(timeout);

            if (vertexError.name === 'AbortError') {
                console.error('Vertex AI request timed out after 45 seconds');
                throw new Error('Vertex AI request timed out after 45 seconds');
            }

            console.error('Vertex AI API Error details:', {
                message: vertexError.message,
                code: vertexError.code,
                details: vertexError.details,
                status: vertexError.status,
                stack: vertexError.stack
            });

            throw new Error(`Vertex AI processing failed: ${vertexError.message}`);
        }

    } catch (error) {
        console.error('Full Analysis Error:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            details: error.details
        });

        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error.message,
                // Include more details for debugging
                ...(process.env.NODE_ENV === 'development' && {
                    stack: error.stack,
                    code: error.code,
                    fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
                })
            },
            { status: 500 }
        );
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
}
