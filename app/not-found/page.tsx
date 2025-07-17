import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                <h1 className="text-4xl font-bold mb-4 text-gray-800">404 - Page Not Found</h1>
                <p className="text-lg mb-8 text-gray-600">
                    The page you're looking for might have been removed or is temporarily unavailable.
                </p>
                <Link
                    href="/"
                    className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
                >
                    Return to Homepage
                </Link>
            </div>
        </div>
    );
}