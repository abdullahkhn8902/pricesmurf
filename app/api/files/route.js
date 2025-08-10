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
        const metadataOnly = searchParams.get('metadata') === '1';

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
                return new Response(JSON.stringify({
                    sheetName,
                    columns: [],
                    data: [],
                    warning: 'File is empty or has no valid data',
                    isReadOnly: file.metadata?.isReadOnly || false,
                    category: file.metadata?.category || 'Other Tables',
                    subcategory: file.metadata?.subcategory || 'Uncategorized',
                    // ADDED: Return pricing list status
                    isPriceList: file.metadata?.isPriceList || false
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            if (metadataOnly) {
                return new Response(JSON.stringify({
                    id: file._id.toString(),
                    filename: file.filename,
                    category: file.metadata?.category || 'Other Tables',
                    subcategory: file.metadata?.subcategory || 'Uncategorized',
                    readOnly: file.metadata?.isReadOnly || false,
                    // ADDED: Return pricing list status
                    isPriceList: file.metadata?.isPriceList || false
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify({
                sheetName,
                columns,
                data,
                isReadOnly: file.metadata?.isReadOnly || false,
                category: file.metadata?.category || 'Other Tables',
                subcategory: file.metadata?.subcategory || 'Uncategorized',
                // ADDED: Return pricing list status
                isPriceList: file.metadata?.isPriceList || false
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            const { db } = await connectToDatabase();
            const filesCollection = db.collection('excelFiles.files');

            if (metadataOnly) {
                const files = await filesCollection
                    .find({ 'metadata.userId': userId })
                    .sort({ uploadDate: -1 })
                    .project({
                        _id: 1,
                        filename: 1,
                        'metadata.category': 1,
                        'metadata.subcategory': 1,
                        'metadata.isReadOnly': 1,
                        'metadata.isPriceList': 1
                    })
                    .toArray();

                return new Response(JSON.stringify(files.map(file => ({
                    id: file._id.toString(),
                    filename: file.filename,
                    readOnly: file.metadata?.isReadOnly || false,
                    category: file.metadata?.category || 'Other Tables',
                    subcategory: file.metadata?.subcategory || 'Uncategorized',
                    // ADDED: Return pricing list status
                    isPriceList: file.metadata?.isPriceList || false
                }))), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const files = await filesCollection
                .find({ 'metadata.userId': userId })
                .sort({ uploadDate: -1 })
                .toArray();

            return new Response(JSON.stringify(files.map(file => ({
                id: file._id.toString(),
                filename: file.filename,
                uploadDate: file.uploadDate,
                contentType: file.contentType,
                readOnly: file.metadata?.isReadOnly || false,
                category: file.metadata?.category || 'Other Tables',
                subcategory: file.metadata?.subcategory || 'Uncategorized',
                // ADDED: Return pricing list status
                isPriceList: file.metadata?.isPriceList || false
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

// PUT method remains unchanged
export async function PUT(request) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('id');

        if (!fileId || !ObjectId.isValid(fileId)) {
            return new Response(JSON.stringify({ error: 'Invalid file ID' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { userId } = await auth();
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });

        const { db } = await connectToDatabase();
        const filesCollection = db.collection('excelFiles.files');
        const bucket = await getGridFSBucket();

        const existingFile = await filesCollection.findOne({
            _id: new ObjectId(fileId),
            'metadata.userId': userId,
        });

        if (!existingFile) {
            return new Response(JSON.stringify({ error: 'File not found or you do not have permission to update it' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (existingFile.metadata?.isReadOnly) {
            return new Response(JSON.stringify({
                error: 'Cannot update read-only file'
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const updatedData = await request.json();
        const { sheetName, columns, data } = updatedData;

        await bucket.delete(new ObjectId(fileId));

        let fileBuffer;
        if (existingFile.contentType === 'text/csv' || existingFile.filename.endsWith('.csv')) {
            const header = columns.join(',');
            const rows = data.map(row => columns.map(col => `"${(row[col] || '').toString().replace(/"/g, '""')}"`).join(','));
            const csvContent = [header, ...rows].join('\n');
            fileBuffer = Buffer.from(csvContent, 'utf8');
        } else if (
            (existingFile.contentType &&
                (existingFile.contentType.includes('spreadsheet') ||
                    existingFile.contentType.includes('excel') ||
                    existingFile.contentType.includes('xlsx') ||
                    existingFile.contentType.includes('xls'))) ||
            existingFile.filename.endsWith('.xlsx') ||
            existingFile.filename.endsWith('.xls')
        ) {
            const workbook = XLSX.utils.book_new();
            const worksheetData = [
                columns,
                ...data.map(row => columns.map(col => row[col] || ''))
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');
            fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        } else {
            return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const uploadStream = bucket.openUploadStreamWithId(
            new ObjectId(fileId),
            existingFile.filename,
            {
                contentType: existingFile.contentType,
                metadata: existingFile.metadata,
            }
        );

        const readable = new Readable();
        readable.push(fileBuffer);
        readable.push(null);

        await new Promise((resolve, reject) => {
            readable.pipe(uploadStream)
                .on('finish', resolve)
                .on('error', reject);
        });

        return new Response(JSON.stringify({ message: 'File updated successfully' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error in PUT /api/files:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}