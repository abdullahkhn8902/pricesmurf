import { MongoClient, GridFSBucket } from 'mongodb';
import { NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    let client;
    try {
        const { userId } = getAuth(request);
        console.log('API Upload - User ID:', userId);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI missing in .env.local');

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const formData = await request.formData();
        const file = formData.get('file');
        const sessionId = formData.get('sessionId');
        const isReadOnly = formData.get('isReadOnly') === 'true';
        const isPriceList = formData.get('isPriceList') === 'true';

        // ADDED: Get category and subcategory from form data
        const category = formData.get('category');
        const subcategory = formData.get('subcategory');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });
        }
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            return NextResponse.json({ error: 'Only Excel/CSV files allowed' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDate = new Date();
        const uploadStream = bucket.openUploadStream(file.name, {
            metadata: {
                userId,
                uploadedAt: uploadDate,
                sessionId,
                isReadOnly,
                isPriceList,
                // ADDED: Store category/subcategory in metadata
                category,
                subcategory
            }
        });
        uploadStream.write(buffer);
        uploadStream.end();

        const fileId = await new Promise((resolve, reject) => {
            uploadStream.on('finish', () => resolve(uploadStream.id.toString()));
            uploadStream.on('error', reject);
        });

        return NextResponse.json(
            {
                message: 'File uploaded successfully',
                fileId,
                filename: file.name,
                sessionId,
                isPriceList,
                category,
                subcategory
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: `Upload failed: ${error.message}` },
            { status: 500 }
        );
    } finally {
        await client?.close();
    }
}