import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)', '/upload(.*)']);

export default clerkMiddleware(
    async (auth, req) => {

        // Allow access to public assets
        if (req.nextUrl.pathname.startsWith('/_next/') ||
            req.nextUrl.pathname.startsWith('/favicon.ico') ||
            req.nextUrl.pathname.startsWith('/api/')) {
            return;
        }

        if (isDashboardRoute(req)) {
            // FIX: Use auth() instead of auth
            await auth.protect();
        }
    },
    { // FIX: Move debug option outside async function
        debug: process.env.NODE_ENV !== 'production'
    }
);

export const config = {
    matcher: [
        // Skip internal paths and static files
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};