import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient } from 'mongodb';

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

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { db } = await connectToDatabase();
        const filesCollection = db.collection('excelFiles.files');

        // Check if user has any files in the database
        const fileCount = await filesCollection.countDocuments({
            'metadata.userId': userId
        });

        return NextResponse.json({ hasData: fileCount > 0 });
    } catch (error) {
        console.error('Error checking user data:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
