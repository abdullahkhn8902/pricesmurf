export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');

        async function getSecret(projectId: string, secretName: string): Promise<string> {
            const client = new SecretManagerServiceClient();
            const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
            const [version] = await client.accessSecretVersion({ name });

            // Add explicit checks for version, payload, and data
            if (!version?.payload?.data) {
                throw new Error(`Secret '${secretName}' not found or has no data.`);
            }

            return version.payload.data.toString('utf8');
        }

        try {
            console.log('Fetching secrets from Secret Manager...');
            const projectId = 'neural-land-469712-t7';
            const clerkSecretKey = await getSecret(projectId, 'CLERK_SECRET_KEY');
            const mongodbUri = await getSecret(projectId, 'MONGODB_URI');
            const openrouterApiKey = await getSecret(projectId, 'OPENROUTER_API_KEY');

            process.env.CLERK_SECRET_KEY = clerkSecretKey;
            process.env.MONGODB_URI = mongodbUri;
            process.env.OPENROUTER_API_KEY = openrouterApiKey;

            console.log('Secrets successfully loaded for server-side use.');
        } catch (err) {
            console.error('Failed to fetch secrets from Secret Manager:', err);
            process.exit(1);
        }
    }
}
