import { MongoClient, ObjectId } from 'mongodb';
import { getAuth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function PUT(request) {
    let client;
    try {
        const { userId } = getAuth(request);
        console.log('API Filename Update - User ID:', userId);
        if (!userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI missing in .env.local');

        const { id, newFilename } = await request.json();
        console.log('Updating filename for:', id, 'to:', newFilename);

        if (!id || !newFilename) {
            return new Response(JSON.stringify({ error: 'Missing id or newFilename' }), {
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

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');
        const filesCollection = db.collection('excelFiles.files');

        // Get existing file to preserve extension
        const existingFile = await filesCollection.findOne({
            _id: new ObjectId(id),
            'metadata.userId': userId
        });

        if (!existingFile) {
            return new Response(JSON.stringify({
                error: 'File not found or user mismatch'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Preserve file extension
        const originalExtension = existingFile.filename.split('.').pop();
        const updatedFilename = newFilename.includes('.')
            ? newFilename
            : `${newFilename}.${originalExtension}`;

        const result = await filesCollection.updateOne(
            {
                _id: new ObjectId(id),
                'metadata.userId': userId
            },
            {
                $set: { filename: updatedFilename }
            }
        );

        if (result.matchedCount === 0) {
            return new Response(JSON.stringify({ error: 'File not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log('Filename updated successfully');
        return new Response(JSON.stringify({
            success: true,
            newFilename: updatedFilename
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Filename update error:', error);
        return new Response(JSON.stringify({
            error: `Update failed: ${error.message}`
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    } finally {
        await client?.close();
    }
}