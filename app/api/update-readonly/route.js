import { MongoClient, ObjectId } from 'mongodb';
import { getAuth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function PUT(request) {
    let client;
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { id, readOnly } = await request.json();

        if (!id || typeof readOnly === 'undefined') {
            return new Response(JSON.stringify({ error: 'Missing id or readOnly status' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!ObjectId.isValid(id)) {
            return new Response(JSON.stringify({ error: 'Invalid file ID format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const uri = process.env.MONGODB_URI;
        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');
        const filesCollection = db.collection('excelFiles.files');

        const result = await filesCollection.updateOne(
            {
                _id: new ObjectId(id),
                'metadata.userId': userId
            },
            {
                $set: { 'metadata.isReadOnly': readOnly }
            }
        );

        if (result.matchedCount === 0) {
            return new Response(JSON.stringify({ error: 'File not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Error updating read-only status:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    } finally {
        await client?.close();
    }
}