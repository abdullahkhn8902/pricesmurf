import logger from '@/lib/logger';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // This endpoint can be used to check monitoring status
        // or retrieve monitoring data
        res.status(200).json({
            status: 'monitoring_active',
            project: 'neural-land-469712-t7',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Monitoring API error', {
            request_id: req.headers['x-request-id'],
            user_id: req.headers['x-clerk-user-id'],
            error: error.message
        });

        res.status(500).json({ error: 'Internal server error' });
    }
}