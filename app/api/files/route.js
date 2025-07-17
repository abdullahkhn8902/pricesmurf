import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import { auth } from '@clerk/nextjs/server';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

const uri = process.env.MONGODB_URI || 'mongodb+srv://mak53797571:Jy3X0iE7mCuOkEma@cluster0.gccun0i.mongodb.net/Project0?retryWrites=true&w=majority';

// Global cached connection promise
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('Project0');

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

async function getGridFSBucket() {
    const { db } = await connectToDatabase();
    return new GridFSBucket(db, { bucketName: 'excelFiles' });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('id');

        const { userId } = await auth();
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });

        const bucket = await getGridFSBucket();

        if (fileId) {
            if (!ObjectId.isValid(fileId)) {
                return new Response(JSON.stringify({ error: 'Invalid file ID' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const { db } = await connectToDatabase();
            const filesCollection = db.collection('excelFiles.files');

            const file = await filesCollection.findOne({
                _id: new ObjectId(fileId),
                'metadata.userId': userId,
            });

            if (!file) {
                return new Response(JSON.stringify({ error: 'File not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
            const chunks = [];
            for await (const chunk of downloadStream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            let sheetName = file.filename.split('.')[0] || 'Unnamed Sheet';
            let columns = [];
            let data = [];

            // CSV Handling
            if (file.contentType === 'text/csv' || file.filename.endsWith('.csv')) {
                const records = parse(buffer.toString(), {
                    skip_empty_lines: true,
                    trim: true,
                    relax_column_count: true,
                });

                const rawHeader = records[0] || [];
                const hasIndexColumn = typeof rawHeader[0] === 'number' || rawHeader[0] === '0';

                const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;
                columns = rawColumns.map(col =>
                    (col || '').toString().replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed'
                );

                data = records.slice(1).map(row => {
                    const trimmedRow = hasIndexColumn ? row.slice(1) : row;
                    const obj = {};
                    columns.forEach((col, i) => {
                        obj[col] = trimmedRow[i] !== undefined ? trimmedRow[i].toString() : '';
                    });
                    return obj;
                });
            } else if (
                (file.contentType && (
                    file.contentType.includes('spreadsheet') ||
                    file.contentType.includes('excel') ||
                    file.contentType.includes('xlsx') ||
                    file.contentType.includes('xls')
                )) ||
                file.filename.endsWith('.xlsx') ||
                file.filename.endsWith('.xls')
            ) {
                // Parse Excel
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                const rawHeader = jsonData[0] || [];
                const hasIndexColumn = typeof rawHeader[0] === 'number' || rawHeader[0] === '0';

                const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;
                columns = rawColumns.map(col =>
                    (col || '').toString().replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed'
                );

                data = jsonData.slice(1).map(row => {
                    const trimmedRow = hasIndexColumn ? row.slice(1) : row;
                    const obj = {};
                    columns.forEach((col, i) => {
                        obj[col] = trimmedRow[i] !== undefined ? trimmedRow[i].toString() : '';
                    });
                    return obj;
                });
            } else {
                return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (columns.length === 0 && data.length === 0) {
                return new Response(JSON.stringify({ sheetName, columns: [], data: [], warning: 'File is empty or has no valid data' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify({ sheetName, columns, data }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            const { db } = await connectToDatabase();
            const filesCollection = db.collection('excelFiles.files');

            const files = await filesCollection
                .find({ 'metadata.userId': userId })
                .toArray();

            return new Response(JSON.stringify(files.map(file => ({
                id: file._id.toString(),
                filename: file.filename,
                uploadDate: file.uploadDate,
                contentType: file.contentType,
            }))), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (error) {
        console.error('Error in GET /api/files:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}