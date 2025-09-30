import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

// Import the logger utility correctly
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

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
    logger.info('Vertex AI initialized successfully', { project: PROJECT, location: LOCATION });
} catch (error) {
    logger.error('Vertex AI initialization error', { error: error.message });
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

// --- Small helper for safe/masked logging of secrets ---
function maskSecret(secret) {
    if (!secret || typeof secret !== 'string') return 'N/A';
    if (secret.length <= 4) return '***' + secret;
    return '***' + secret.slice(-4);
}

export async function POST(request) {
    // Get request ID from headers for tracing
    const requestId = request.headers.get('x-request-id') || 'unknown';
    const userId = request.headers.get('x-clerk-user-id') || 'unknown';

    // Log the start of the request
    logger.info('API request received', {
        request_id: requestId,
        user_id: userId,
        path: request.url,
        method: 'POST'
    });

    const uri = process.env.MONGODB_URI;
    const VERTEX_AI_PROJECT = (process.env.VERTEX_AI_PROJECT || 'neural-land-469712-t7').toString().trim();
    const VERTEX_AI_LOCATION = (process.env.VERTEX_AI_LOCATION || 'us-central1').toString().trim();

    if (!uri) {
        logger.error('MongoDB URI missing', { request_id: requestId, user_id: userId });
        return NextResponse.json({ error: 'MONGODB_URI missing in environment variables' }, { status: 500 });
    }

    if (!VERTEX_AI_PROJECT || !VERTEX_AI_LOCATION) {
        logger.error('Vertex AI configuration missing', { request_id: requestId, user_id: userId });
        return NextResponse.json({ error: 'Vertex AI configuration missing in environment variables' }, { status: 500 });
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        logger.info('MongoDB connected successfully', { request_id: requestId, user_id: userId });

        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');
        const { customPrompt } = await request.json();

        // Verify authentication with Clerk
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
            logger.warning('Unauthorized access attempt', { request_id: requestId });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!fileId || !ObjectId.isValid(fileId)) {
            logger.warning('Invalid file ID provided', { request_id: requestId, user_id: clerkUserId, file_id: fileId });
            return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
        }

        // Get file metadata
        const filesCollection = db.collection('excelFiles.files');
        const file = await filesCollection.findOne({
            _id: new ObjectId(fileId),
            'metadata.userId': clerkUserId
        });

        if (!file) {
            logger.warning('File not found', { request_id: requestId, user_id: clerkUserId, file_id: fileId });
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        logger.info('File found, downloading content', {
            request_id: requestId,
            user_id: clerkUserId,
            file_id: fileId,
            filename: file.filename
        });

        // Download file content
        const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
        const chunks = [];
        for await (const chunk of downloadStream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Process file data
        const filename = file.filename || 'unknown';
        const contentType = file.contentType || 'application/octet-stream';
        const { columns, data } = await processFileData(buffer, filename, contentType);

        if (!columns.length || !data.length) {
            logger.warning('No valid data found in file', { request_id: requestId, user_id: clerkUserId, file_id: fileId });
            return NextResponse.json({ error: 'No valid data found' }, { status: 400 });
        }

        logger.info('File processed successfully', {
            request_id: requestId,
            user_id: clerkUserId,
            file_id: fileId,
            columns_count: columns.length,
            rows_count: data.length
        });

        // Ensure vertexAI is initialized
        if (!vertexAI) {
            try {
                vertexAI = new VertexAI({
                    project: VERTEX_AI_PROJECT,
                    location: VERTEX_AI_LOCATION,
                    apiEndpoint: `${VERTEX_AI_LOCATION}-aiplatform.googleapis.com`,
                });
                logger.info('Vertex AI late-init successful', { request_id: requestId, user_id: clerkUserId });
            } catch (initErr) {
                logger.error('Vertex AI late-init error', {
                    request_id: requestId,
                    user_id: clerkUserId,
                    error: initErr.message
                });
                throw new Error('Vertex AI not initialized and late-init failed');
            }
        }

        // Validate custom prompt
        if (!customPrompt || !customPrompt.toString().trim()) {
            logger.warning('Missing prompt in request', { request_id: requestId, user_id: clerkUserId });
            return NextResponse.json({ error: 'Missing prompt in request body' }, { status: 400 });
        }

        // Prepare prompt for Vertex AI
        const dataString = JSON.stringify({ columns, data }, null, 2);
        const prompt = `${customPrompt.toString().trim()}\n\nData:\n${dataString}`;

        const model = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        logger.info('Calling Vertex AI', {
            request_id: requestId,
            user_id: clerkUserId,
            model: 'gemini-2.5-flash-lite'
        });

        // --- Start: safe, minimal telemetry around Vertex call (DO NOT log full secrets) ---
        const startTs = Date.now();
        logger.info('vertex_call_start', {
            request_id: requestId,
            user_id: clerkUserId,
            model: 'gemini-2.5-flash-lite',
            masked_token: maskSecret(process.env.VERTEX_AI_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'sa-key'),
            note: 'vertex_call_start'
        });

        let result;
        try {
            result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            // Pull the aggregated response object that the Node SDK returns
            const responseFromModel = result?.response || null;

            // The official REST/SDK provides usage metadata under usageMetadata (camelCase),
            // but some shapes (or older SDKs) might nest differently, so be tolerant:
            const usage = responseFromModel?.usageMetadata
                ?? responseFromModel?.usage_metadata
                ?? responseFromModel?.usage
                ?? null;

            // Normalize token counts (support a few possible field namings)
            const promptTokens = usage?.promptTokenCount ?? usage?.prompt_token_count ?? usage?.prompt_tokens ?? null;
            const candidatesTokens = usage?.candidatesTokenCount ?? usage?.candidates_token_count ?? usage?.candidates_tokens ?? null;
            const totalTokens = usage?.totalTokenCount ?? usage?.total_token_count ?? (Number(promptTokens) + Number(candidatesTokens) || null);

            const durationMs = Date.now() - startTs;

            // Log the usage as structured fields (safe; no secrets)
            logger.info('Vertex AI call successful', {
                request_id: requestId,
                user_id: clerkUserId,
                model: 'gemini-2.5-flash-lite',
                duration_ms: durationMs,
                prompt_tokens: promptTokens,
                candidates_tokens: candidatesTokens,
                total_tokens: totalTokens,
                // include raw usage only in dev to help debugging if shapes differ
                usage_raw: process.env.NODE_ENV === 'development' ? usage : undefined,
                note: 'vertex_call_success'
            });
        } catch (vErr) {
            const durationMs = Date.now() - startTs;
            // log a structured error entry (safe)
            logger.error('vertex_call_error', {
                request_id: requestId,
                user_id: clerkUserId,
                model: 'gemini-2.5-flash-lite',
                duration_ms: durationMs,
                error: vErr?.message || String(vErr),
                note: 'vertex_call_error'
            });
            // rethrow to preserve your existing error behavior
            throw vErr;
        }

        // --- End: wrapper around Vertex call ---

        const response = result?.response;
        const analysis = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No analysis generated';

        // Log a final "end" event with duration and analysis length
        try {
            const durationMs = Date.now() - startTs;
            logger.info('vertex_call_end', {
                request_id: requestId,
                user_id: clerkUserId,
                model: 'gemini-2.5-flash-lite',
                duration_ms: durationMs,
                analysis_length: analysis.length,
                note: 'vertex_call_end'
            });
        } catch (logErr) {
            // non-fatal logging failure should not break main flow
            logger.error('vertex_call_end_logging_error', { request_id: requestId, error: logErr?.message || String(logErr) });
        }

        // Store analysis in DB
        await db.collection('analyses').updateOne(
            { fileId: new ObjectId(fileId), userId: clerkUserId },
            { $set: { analysis, updatedAt: new Date() } },
            { upsert: true }
        );

        logger.info('Analysis stored in database', {
            request_id: requestId,
            user_id: clerkUserId,
            file_id: fileId
        });

        const sheetName = filename.includes('.') ? filename.split('.')[0] : 'Unnamed Sheet';

        // Log successful completion
        logger.info('API request completed successfully', {
            request_id: requestId,
            user_id: clerkUserId,
            file_id: fileId,
            analysis_length: analysis.length
        });

        return NextResponse.json({
            sheetName,
            columns,
            data: data.slice(0, 100),
            analysis
        }, { status: 200 });

    } catch (error) {
        logger.error('API processing error', {
            request_id: requestId,
            user_id: userId,
            error: error.message,
            stack: error.stack
        });

        return NextResponse.json({
            error: 'Internal server error',
            details: error?.message || String(error),
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        }, { status: 500 });
    } finally {
        await client.close();
        logger.info('Database connection closed', { request_id: requestId, user_id: userId });
    }
}
