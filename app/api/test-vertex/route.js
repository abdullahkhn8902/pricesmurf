import { VertexAI } from '@google-cloud/vertexai';

export const dynamic = 'force-dynamic';

let vertexAI;
try {
    vertexAI = new VertexAI({
        project: 'neural-land-469712-t7',
        location: 'us-central1',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com',
    });
    console.log('Vertex AI initialized');
} catch (err) {
    console.error('Vertex AI init error:', err);
}

// Sleep helper
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
    try {
        if (!vertexAI) throw new Error('Vertex AI not initialized');

        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'How are you?' }] }],
        });

        console.log('Vertex AI response:', JSON.stringify(result, null, 2));

        // Sleep for 3 seconds before sending response
        await sleep(5000);

        return new Response(JSON.stringify({ success: true, result }, null, 2));
    } catch (err) {
        console.error('Vertex AI call error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
