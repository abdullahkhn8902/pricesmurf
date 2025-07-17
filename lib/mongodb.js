// app/api/session/route.js
import { connectToDatabase } from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.text();

        if (!body) {
            return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
        }

        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
        }

        const { sessionId, metadata } = parsed;

        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        const { db } = await connectToDatabase();

        await db.collection('sessionMetadata').updateOne(
            { sessionId },
            { $set: { ...metadata, updatedAt: new Date() } },
            { upsert: true }
        );

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Session metadata error:', error);
        return NextResponse.json(
            { error: `Failed to save metadata: ${error.message}` },
            { status: 500 }
        );
    }
}
