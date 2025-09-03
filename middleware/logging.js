import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export function loggingMiddleware(request) {
    const requestId = uuidv4();
    const userId = request.headers.get('x-clerk-user-id') || 'unknown';

    // Clone the request and add headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // Add response headers
    response.headers.set('x-request-id', requestId);

    // Log the request (we'll implement the actual logging later)
    console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Incoming request',
        request_id: requestId,
        user_id: userId,
        env: process.env.NODE_ENV,
        path: request.nextUrl.pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
    }));

    return response;
}