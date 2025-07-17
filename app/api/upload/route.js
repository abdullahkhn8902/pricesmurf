import { MongoClient } from 'mongodb';
import { GridFSBucket } from 'mongodb';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request) {
    let client;
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI missing in .env.local');

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');
        const bucket = new GridFSBucket(db, { bucketName: 'excelFiles' });

        const formData = await request.formData();
        const file = formData.get('file');
        const sessionId = formData.get('sessionId');

        if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        if (!sessionId) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });

        const validExtensions = /\.(xlsx|xls|csv)$/i;
        if (!file.name.match(validExtensions)) {
            return NextResponse.json({ error: 'Only Excel/CSV files allowed' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const uploadDate = new Date();

        const uploadStream = bucket.openUploadStream(file.name, {
            metadata: {
                userId,
                uploadedAt: uploadDate,
                sessionId
            }
        });

        uploadStream.write(buffer);
        uploadStream.end();

        const fileId = await new Promise((resolve, reject) => {
            uploadStream.on('finish', () => resolve(uploadStream.id));
            uploadStream.on('error', reject);
        });

        // Count files in THIS SESSION
        const sessionFileCount = await db.collection('excelFiles.files')
            .countDocuments({
                'metadata.userId': userId,
                'metadata.sessionId': sessionId
            });

        return NextResponse.json({
            message: 'File uploaded successfully',
            fileId,
            filename: file.name,
            sessionId
        }, { status: 200 });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: `Upload failed: ${error.message}` },
            { status: 500 }
        );
    } finally {
        client?.close();
    }
}