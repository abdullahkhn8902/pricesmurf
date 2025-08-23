// app/api/gemini/route.ts (Alternative approach)
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { prompt } = await req.json();

        if (!prompt) {
            return NextResponse.json(
                { error: "Prompt is required" },
                { status: 400 }
            );
        }

        // Use the REST API directly
        const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/clear-beacon-469418-k8/locations/us-central1/publishers/google/models/gemini-1.5-flash:predict`;

        // Get access token using service account
        const authHeader = await getAuthHeader();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                instances: [
                    {
                        content: prompt
                    }
                ],
                parameters: {
                    temperature: 0.2,
                    maxOutputTokens: 1024,
                    topP: 0.8,
                    topK: 40
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const text = data.predictions?.[0]?.content || "No response generated";

        return NextResponse.json({ text });
    } catch (err: any) {
        console.error("Gemini API Error:", err.message);
        return NextResponse.json(
            { error: "Failed to generate content", details: err.message },
            { status: 500 }
        );
    }
}

// Helper function to get authentication header
async function getAuthHeader() {
    // For development, use the service account key file
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    return `Bearer ${accessToken.token}`;
}