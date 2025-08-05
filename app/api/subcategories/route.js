import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient } from 'mongodb';
export async function GET(request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('Project0');

        // Get custom subcategories
        const subcategories = await db.collection('subcategories')
            .find({ userId })
            .toArray();

        return NextResponse.json(subcategories, { status: 200 });
    } catch (err) {
        return NextResponse.json(
            { error: 'Failed to fetch subcategories' },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}


export async function POST(request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { category, subcategory } = await request.json();

    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('Project0');

        // Store in database
        await db.collection('subcategories').insertOne({
            userId,
            category,
            subcategory,
            createdAt: new Date()
        });

        return NextResponse.json(
            { success: true },
            { status: 200 }
        );
    } catch (err) {
        return NextResponse.json(
            { error: 'Failed to create subcategory' },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}