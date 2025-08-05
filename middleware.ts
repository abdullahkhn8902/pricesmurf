import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isDashboardRoute = createRouteMatcher([
    '/dashboard(.*)',
    '/upload(.*)',
    '/createOrUpload(.*)'
]);

export default clerkMiddleware(

    async (auth, req) => {
        if (
            req.nextUrl.pathname.startsWith('/_next/') ||
            req.nextUrl.pathname.startsWith('/favicon.ico')
        ) {
            return;
        }

        if (isDashboardRoute(req)) {
            await auth.protect();
        }
        if (req.nextUrl.pathname.startsWith('/api')) {
            return;
        }
    },
    {

        debug: process.env.NODE_ENV !== 'production',
    }

);

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)',
        '/(api|trpc)(.*)',
    ],
};
