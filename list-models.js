// list-models.js
const { GoogleAuth } = require('google-auth-library');

async function listModels() {
    try {
        const auth = new GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const project = 'clear-beacon-469418-k8';
        const location = 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/models`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Available models:');
        if (data.models) {
            data.models.forEach(model => {
                console.log(`- ${model.name} (${model.displayName})`);
            });
        } else {
            console.log('No models found or you might not have access.');
        }
    } catch (error) {
        console.error('Error listing models:', error.message);
    }
}

listModels();