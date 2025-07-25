import { MongoClient } from 'mongodb';
import { GridFSBucket } from 'mongodb';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import ExcelJS from 'exceljs';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

// In-memory lock to prevent concurrent processing
const processingLocks = new Map();

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

    let client;
    const startTime = Date.now(); // Track total execution time

    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { sessionId } = await request.json();
        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        // Prevent concurrent processing for same session
        if (processingLocks.has(sessionId)) {
            return NextResponse.json(
                { error: 'Combine operation already in progress for this session' },
                { status: 429 }
            );
        }
        processingLocks.set(sessionId, true);

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const sessionMetadata = await db.collection('sessionMetadata')
            .findOne({ sessionId });

        const combineData = sessionMetadata?.combineData || false;
        const joinType = sessionMetadata?.joinType || "";
        const customPrompt = sessionMetadata?.customPrompt || "";

        // 1. Get consistent snapshot of files at request start
        const requestStartTime = new Date();
        const recentFiles = await db.collection('excelFiles.files')
            .find({
                'metadata.userId': userId,
                'metadata.sessionId': sessionId,
                'metadata.uploadedAt': { $lte: requestStartTime } // Only files uploaded before request
            })
            .sort({ 'metadata.uploadedAt': -1 })
            .toArray();

        console.log(`Found ${recentFiles.length} files for session ${sessionId} as of ${requestStartTime.toISOString()}`);

        // 2. Check for existing combined file for this exact file set
        const fileIds = recentFiles.map(file => file._id.toString()).sort().join(',');
        const existingCombinedFile = await db.collection('excelFiles.files')
            .findOne({
                'metadata.userId': userId,
                'metadata.sessionId': sessionId,
                'metadata.sourceFileIds': fileIds,
                'metadata.isCombined': true
            });

        if (existingCombinedFile) {
            processingLocks.delete(sessionId);
            console.log(`Reusing existing combined file: ${existingCombinedFile._id}`);
            return NextResponse.json({ fileId: existingCombinedFile._id }, { status: 200 });
        }

        // Parallel file processing
        const datasetsText = await Promise.all(recentFiles.map(async (file) => {
            const buffer = await new Promise((resolve, reject) => {
                const chunks = [];
                bucket.openDownloadStream(file._id)
                    .on('data', chunk => chunks.push(chunk))
                    .on('end', () => resolve(Buffer.concat(chunks)))
                    .on('error', reject);
            });

            const workbook = new ExcelJS.Workbook();
            if (file.filename.toLowerCase().endsWith('.csv')) {
                await workbook.csv.read(buffer.toString());
            } else {
                await workbook.xlsx.load(buffer);
            }

            const worksheet = workbook.worksheets[0];
            let text = `[File: ${file.filename}]\n`;

            // Get headers
            const headerRow = worksheet.getRow(1);
            const headers = [];
            headerRow.eachCell({ includeEmpty: false }, cell => {
                headers.push(cell.value);
            });
            text += `Columns: ${headers.join(', ')}\n`;

            // Get sample rows (first 3) for efficiency
            text += "Sample Rows:\n";
            const rowCount = Math.min(worksheet.rowCount, 4); // Header + 3 rows
            for (let i = 2; i <= rowCount; i++) {
                const row = worksheet.getRow(i);
                const rowValues = [];
                row.eachCell({ includeEmpty: false }, cell => {
                    rowValues.push(cell.value);
                });
                text += `${rowValues.join('|')}\n`;
            }

            return text;
        }));

        // Build DeepSeek prompt
        let prompt = `
COMBINE THESE DATASETS INTO A SINGLE COMBINED DATASET:
${datasetsText.join('\n\n')}

INSTRUCTIONS:
1. Analyze and standardize column names across all datasets
2. Infer relationships between datasets
3. Combine all data into a single dataset
4. Add calculated fields where appropriate
5. OUTPUT ONLY AS A SINGLE JSON ARRAY OF OBJECTS
6. Ensure the JSON is complete and well-formatted
7. IMPORTANT: Return minimal JSON without formatting or explanations

COLUMN STANDARDIZATION PRINCIPLES:
- Apply consistent casing (PascalCase)
- Resolve abbreviations ("Qty" → "Quantity")
- Normalize date formats
- Handle synonymous terms
- Correct common misspellings
- Remove special characters and spaces
`.trim();
        if (joinType) {
            prompt += `\n\nJOIN REQUIREMENT: Use ${joinType}`;
        }

        if (customPrompt) {
            prompt += `\n\nUSER SPECIFIC REQUIREMENT: ${customPrompt}`;
        }

        console.log('Sending request to OpenRouter API...');

        const domain = process.env.NODE_ENV === 'development'
            ? 'http://localhost:3000'
            : 'https://your-actual-domain.com';

        // Add timeout to API request
        const controller = new AbortController();
        const aiTimeout = setTimeout(() => controller.abort(), 180000); // 3-minute timeout
        const vercelTimeout = setTimeout(() => controller.abort(), 9000); // 9s for Vercel timeout buffer

        const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': domain,
                'X-Title': 'DataCombiner',
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-r1:free',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.1,
                max_tokens: 8192
            }),
            signal: controller.signal
        }).finally(() => {
            clearTimeout(aiTimeout);
            clearTimeout(vercelTimeout);
        });

        if (!apiResponse.ok) {
            processingLocks.delete(sessionId);
            const errorText = await apiResponse.text();
            console.error('OpenRouter API error:', apiResponse.status, errorText.substring(0, 500));
            throw new Error(`OpenRouter API error: ${apiResponse.status}`);
        }

        // Stream and accumulate response to avoid Vercel memory limits
        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();
        let responseText = '';
        let chunkCount = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            chunkCount++;
            responseText += decoder.decode(value, { stream: true });
        }

        console.log(`Received ${responseText.length} chars in ${chunkCount} chunks`);

        // Validate content before parsing
        const contentType = apiResponse.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            console.error('Non-JSON response:', responseText.substring(0, 1000));
            throw new Error('Invalid response format');
        }

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            // Attempt NDJSON parsing
            if (responseText.includes('\n')) {
                console.warn('Attempting NDJSON parsing');
                const ndjson = parseNDJSON(responseText);
                if (ndjson.length > 0) {
                    responseData = { choices: [{ message: { content: JSON.stringify(ndjson) } }] };
                }
            }

            if (!responseData) {
                console.error('JSON parse failed:', responseText.substring(0, 1000));
                throw e;
            }
        }

        // Check for truncated response
        if (responseData.choices[0]?.finish_reason === 'length') {
            console.warn('Response truncated due to token limit');
        }

        const jsonString = responseData.choices[0].message.content.trim();

        console.log('============= RAW API RESPONSE ===========');
        console.log(jsonString.substring(0, 500) + (jsonString.length > 500 ? '...' : ''));
        console.log('==========================================');

        // Robust JSON parsing
        let combinedData;
        try {
            combinedData = parseAIResponse(jsonString);
        } catch (e) {
            console.error('parseAIResponse error:', e);
            console.error('Response content:', jsonString.substring(0, 1000));
            throw new Error('Failed to parse AI response: ' + e.message);
        }

        if (!combinedData || !Array.isArray(combinedData)) {
            processingLocks.delete(sessionId);
            throw new Error('API response did not return valid array data');
        }

        console.log(`Parsed ${combinedData.length} records`);

        // Convert JSON to Excel
        const newWorkbook = new ExcelJS.Workbook();
        const newSheet = newWorkbook.addWorksheet('Combined Data');

        if (combinedData.length > 0) {
            const headers = Object.keys(combinedData[0]);
            console.log(`Creating Excel with ${headers.length} columns`);
            newSheet.addRow(headers);

            // Optimized row insertion with batch processing
            const batchSize = 1000;
            for (let i = 0; i < combinedData.length; i += batchSize) {
                const batch = combinedData.slice(i, i + batchSize);
                batch.forEach(row => {
                    const rowValues = headers.map(header => row[header]);
                    newSheet.addRow(rowValues);
                });
            }
        } else {
            newSheet.addRow(['No data combined']);
        }

        // Store in GridFS
        const buffer = await newWorkbook.xlsx.writeBuffer();
        const uploadStream = bucket.openUploadStream(`combined-${Date.now()}.xlsx`, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            metadata: {
                userId,
                uploadedAt: new Date(),
                sessionId,
                isCombined: true,
                sourceFileIds: fileIds,
                requestStartTime: requestStartTime
            }
        });

        await new Promise((resolve, reject) => {
            uploadStream.write(buffer);
            uploadStream.end(resolve);
            uploadStream.on('error', reject);
        });

        console.log(`Stored combined file with ID: ${uploadStream.id}`);
        processingLocks.delete(sessionId);
        return NextResponse.json({ fileId: uploadStream.id }, {
            status: 200,
            headers: {
                'X-Exec-Time': `${Date.now() - startTime}ms`,
                'X-Response-Size': `${buffer.byteLength}`
            }
        });

    } catch (error) {
        processingLocks.delete(sessionId);

        // Special handling for timeouts
        if (error.name === 'AbortError') {
            console.error('Request timed out after', Date.now() - startTime, 'ms');
            return NextResponse.json(
                { error: "Processing timeout. Try smaller datasets or simpler operations." },
                { status: 504 }
            );
        }

        console.error('Combination error:', error);
        return NextResponse.json(
            { error: `Combination failed: ${error.message}` },
            { status: 500 }
        );
    } finally {
        if (client) {
            await client.close();
        }
    }
}