"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Hourglass } from "ldrs/react";
import "ldrs/react/Hourglass.css";

// Inner component that uses useSearchParams
function CreateOrUploadContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [isPriceList, setIsPriceList] = useState(false);

    useEffect(() => {
        setIsPriceList(
            searchParams.get('purpose') === 'price-list' ||
            searchParams.get('category') === 'PriceLists'
        );
    }, [searchParams]);

    const handleNavigation = (path) => {
        setLoading(true);
        const newPath = isPriceList ? `${path}?purpose=price-list` : path;
        setTimeout(() => router.push(newPath), 500);
    };

    return (
        <div className="min-h-screen bg-white text-indigo-900 flex flex-col items-center justify-center px-4">
            {isPriceList && (
                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold text-indigo-900">
                        Creating Price List
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">
                        This will be categorized under Price Lists
                    </p>
                </div>
            )}
            <h1 className="text-3xl font-bold mb-6">Start Workspace</h1>
            <p className="mb-8 text-lg text-indigo-900 text-center max-w-xl">
                Choose how you'd like to begin — upload your own files or create a table from scratch using AI or manually.
            </p>

            <div className="grid gap-6 w-full max-w-md">
                <button
                    onClick={() => handleNavigation("/app-pages/upload")}
                    className="bg-indigo-900 text-white font-semibold py-3 px-5 rounded-lg hover:bg-white hover:border-1 hover:text-indigo-900 transition"
                >
                    🧭 Upload Files
                </button>

                <button
                    onClick={() => handleNavigation("/app-pages/manual-generate-table")}
                    className="bg-indigo-900 text-white font-semibold py-3 px-5 rounded-lg hover:bg-white hover:border-1 hover:text-indigo-900 transition"
                >
                    🛠️ Create New Table Manually from Scratch
                </button>
            </div>

            {loading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <Hourglass
                        size="50"
                        bg-opacity="0.1"
                        color="white"
                    />
                </div>
            )}
        </div>
    );
}

// Outer component with Suspense boundary
export default function CreateOrUpload() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Hourglass
                    size="50"
                    color="#312e81"
                />
            </div>
        }>
            <CreateOrUploadContent />
        </Suspense>
    );
}