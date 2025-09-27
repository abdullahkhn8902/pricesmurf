// Simple logger that works in both client and server environments
export const logger = {
    log: (severity: string, message: any, metadata: Record<string, any> = {}) => {
        const logData = {
            severity,
            message: typeof message === 'object' ? JSON.stringify(message) : message,
            ...metadata,
            timestamp: new Date().toISOString(),
        };

        // Stringify for Cloud Logging
        console.log(JSON.stringify(logData));
    },

    info: (message: any, metadata?: Record<string, any>) => logger.log('INFO', message, metadata),
    error: (message: any, metadata?: Record<string, any>) => logger.log('ERROR', message, metadata),
    warn: (message: any, metadata?: Record<string, any>) => logger.log('WARNING', message, metadata),
    debug: (message: any, metadata?: Record<string, any>) => logger.log('DEBUG', message, metadata),
};

export default logger;