import { MongoClient } from 'mongodb';
import { NextResponse } from 'next/server';

export async function POST(request) {
    let client;
    try {
        const { sessionId, metadata } = await request.json();
        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI missing in .env.local');

        client = new MongoClient(uri);
        await client.connect();
        const db = client.db('Project0');

        // Prepare metadata object with default values
        const sessionData = {
            combineData: metadata.combineData || false,
            createNewTable: metadata.createNewTable || false,
            joinType: metadata.joinType || '',
            customPrompt: metadata.customPrompt || '',
            newTableName: metadata.newTableName || '',
            isReadOnly: metadata.isReadOnly || false,
            updatedAt: new Date()
        };

        // Store/update session metadata
        await db.collection('sessionMetadata').updateOne(
            { sessionId },
            { $set: sessionData },
            { upsert: true }
        );

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error) {
        console.error('Session metadata error:', error);
        return NextResponse.json(
            { error: `Failed to save metadata: ${error.message}` },
            { status: 500 }
        );
    } finally {
        client?.close();
    }
}