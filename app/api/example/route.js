import logger from '@/lib/logger';

export default async function handler(req, res) {
    const { method } = req;
    const requestId = req.headers['x-request-id'];
    const userId = req.headers['x-clerk-user-id'];

    try {
        logger.info('API request received', {
            request_id: requestId,
            user_id: userId,
            path: req.url,
            method: method
        });

        // Your existing API logic here
        if (method === 'GET') {
            // Example: Log AI token usage if applicable
            logger.info('AI tokens used', {
                request_id: requestId,
                user_id: userId,
                tokens_used: 100, // Replace with actual token count
                model: 'vertex-ai-model' // Replace with actual model
            });

            res.status(200).json({ success: true, data: [] });
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        logger.error('API error', {
            request_id: requestId,
            user_id: userId,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({ error: 'Internal server error' });
    }
}