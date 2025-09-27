import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const isDashboardRoute = createRouteMatcher([
    '/dashboard(.*)',
    '/upload(.*)',
    '/createOrUpload(.*)'
]);

interface LogData {
    severity: string;
    message: string;
    request_id: string;
    user_id: string;
    env: string | undefined;
    path: string;
    method: string;
    timestamp: string;
}

const logRequest = (request: Request, userId: string = 'unknown'): string => {
    const requestId = uuidv4();
    const logData: LogData = {
        severity: 'INFO',
        message: 'Incoming request',
        request_id: requestId,
        user_id: userId,
        env: process.env.NODE_ENV,
        path: new URL(request.url).pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
    };

    // Log to console (will be captured by Cloud Logging)
    console.log(JSON.stringify(logData));

    return requestId;
};

export default clerkMiddleware(
    async (auth, req) => {
        // Get user ID using Clerk's auth() function
        const authObj = await auth();
        const userId = authObj.userId || 'unknown';

        // Log the request
        const requestId = logRequest(req, userId);

        // Add request ID to headers
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set('x-request-id', requestId);

        if (
            req.nextUrl.pathname.startsWith('/_next/') ||
            req.nextUrl.pathname.startsWith('/favicon.ico')
        ) {
            return NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            });
        }

        if (isDashboardRoute(req)) {
            await auth.protect();
        }

        // For API routes, just pass through with headers
        if (req.nextUrl.pathname.startsWith('/api')) {
            return NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            });
        }

        // For all other routes, pass through with headers
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    },
    {
        debug: false,
    }
);

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
        '/(api|trpc)(.*)',
    ],
};