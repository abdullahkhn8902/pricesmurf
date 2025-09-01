import { VertexAI } from '@google-cloud/vertexai';

// Prevent static analysis during build
export const dynamic = 'force-dynamic';

// Initialize Vertex AI once
let vertexAI;
try {
  vertexAI = new VertexAI({
    project: process.env.VERTEX_AI_PROJECT,
    location: process.env.VERTEX_AI_LOCATION,
    apiEndpoint: 'us-central1-aiplatform.googleapis.com',
  });
  console.log('Vertex AI initialized successfully (Production)');
} catch (error) {
  console.error('Vertex AI initialization error (Production):', error);
}

export async function GET() {
  try {
    if (!vertexAI) throw new Error('Vertex AI not initialized');

    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    });

    // Predefined “hard-coded” query
    const prompt = "How are you?";

    // Timeout safety
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s

    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const responseText =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'No response generated';

    console.log('Vertex AI hard-coded response:', responseText);

    return new Response(
      JSON.stringify({ query: prompt, response: responseText }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Vertex AI hard-coded test error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
