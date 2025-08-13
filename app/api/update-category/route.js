import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { MongoClient, ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function POST(request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { fileIds, category, subcategory } = body;
        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return NextResponse.json({ error: "fileIds must be a non-empty array" }, { status: 400 });
        }
        if (typeof category !== "string" || category.trim() === "") {
            return NextResponse.json({ error: "category is required" }, { status: 400 });
        }

        const uri = process.env.MONGODB_URI;
        if (!uri) {
            return NextResponse.json({ error: "MONGODB_URI missing" }, { status: 500 });
        }

        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db("Project0");

        // Convert to ObjectId array, ignore invalid ids
        const objectIds = fileIds
            .map((id) => {
                try {
                    return new ObjectId(id);
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);

        if (objectIds.length === 0) {
            await client.close();
            return NextResponse.json({ error: "No valid file ids provided" }, { status: 400 });
        }

        const updateResult = await db.collection("excelFiles.files").updateMany(
            {
                _id: { $in: objectIds },
                "metadata.userId": userId
            },
            {
                $set: {
                    "metadata.category": category,
                    "metadata.subcategory": subcategory || "General",
                    "metadata.manualCategoryOverride": true,
                    "metadata.updatedAt": new Date()
                }
            }
        );

        await client.close();

        return NextResponse.json(
            {
                success: true,
                matchedCount: updateResult.matchedCount,
                modifiedCount: updateResult.modifiedCount
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("update-category error:", err);
        return NextResponse.json({ error: err && err.message ? err.message : "Failed to update category" }, { status: 500 });
    }
}
