const { VertexAI } = require("@google-cloud/vertexai");

const project = "clear-beacon-469418-k8";
const location = "us-central1";

const vertexAI = new VertexAI({ project, location });

async function run() {
    const model = "text-bison@001"; // older but usually enabled by default
    const generativeModel = vertexAI.getGenerativeModel({ model });

    const request = {
        contents: [
            {
                role: "user",
                parts: [{ text: "Say hello from text-bison!" }],
            },
        ],
    };

    const result = await generativeModel.generateContent(request);
    console.log(JSON.stringify(result.response, null, 2));
}

run().catch(console.error);
