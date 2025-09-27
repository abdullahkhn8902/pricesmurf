"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const CATEGORY_OPTIONS = [
    "Company Tables",
    "Parameters",
    "Transactions",
    "Other Tables",
    "Price Lists",
];

const BASE_SUBCATS = {
    "Company Tables": ["Products", "Customers"],
    Parameters: ["Pricing Parameters", "Tax Rates"],
    Transactions: ["Historical Transactions"],
    "Other Tables": ["Uncategorized"],
    "Price Lists": ["General"],
};

function ManualGenerateTableWithParams() {
    const searchParams = useSearchParams();
    const isPriceList = !!(searchParams && searchParams.get && searchParams.get("purpose") === "price-list");
    return <ManualGenerateTableContent isPriceList={isPriceList} />;
}

function ManualGenerateTableContent({ isPriceList }) {
    const [columns, setColumns] = useState(["Column 1"]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fileName, setFileName] = useState("");
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState(isPriceList ? "Price Lists" : "");
    const [selectedSubcategory, setSelectedSubcategory] = useState(isPriceList ? "General" : "");

    const availableSubcategories = selectedCategory ? BASE_SUBCATS[selectedCategory] || [] : [];

    useEffect(() => {
        if (isPriceList && !selectedCategory) {
            setSelectedCategory("Price Lists");
            setSelectedSubcategory("General");
        }
    }, [isPriceList, selectedCategory]);

    const addColumn = () => setColumns((prev) => [...prev, `Column ${prev.length + 1}`]);

    const updateColumn = (index, value) => {
        setColumns((prev) => {
            const copy = [...prev];
            copy[index] = value;
            return copy;
        });
    };

    const addRow = () => {
        const newRow = columns.map(() => "");
        setRows((prev) => [...prev, newRow]);
    };

    const updateCell = (rowIndex, colIndex, value) => {
        setRows((prev) => {
            const copy = prev.map((r) => [...r]);
            if (!copy[rowIndex]) copy[rowIndex] = columns.map(() => "");
            copy[rowIndex][colIndex] = value;
            return copy;
        });
    };

    const generateSessionId = () => Math.random().toString(36).substring(2, 10);

    const handleSave = async () => {
        // Validation checks
        if (columns.length === 0) {
            alert("Add at least one column before saving!");
            return;
        }
        if (!fileName.trim()) {
            alert("Please enter a file name");
            return;
        }
        if (!selectedCategory) {
            alert("Please select a category");
            return;
        }
        if (!selectedSubcategory) {
            alert("Please select a subcategory");
            return;
        }

        setLoading(true);

        try {
            // Create CSV
            const csvHeader = columns.join(",");
            const csvRows = rows
                .map((row) =>
                    row
                        .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
                        .join(",")
                )
                .join("\n");

            const csvContent = csvHeader + "\n" + csvRows;
            const blob = new Blob([csvContent], { type: "text/csv" });
            const file = new File([blob], `${fileName.trim()}.csv`, { type: "text/csv" });

            const formData = new FormData();
            formData.append("file", file);
            formData.append("sessionId", generateSessionId());
            formData.append("isPriceList", String(Boolean(isPriceList)));
            formData.append("category", selectedCategory);
            formData.append("subcategory", selectedSubcategory);

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Upload failed");
            }

            // Navigate to dashboard after successful save
            router.push("/app-pages/dashboard");
        } catch (error) {
            alert("Upload failed: " + (error.message || error));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
            {isPriceList && (
                <div className="absolute top-4 left-4 bg-indigo-100 text-indigo-900 px-4 py-2 rounded-md">
                    Creating Price List
                </div>
            )}

            <div className="max-w-6xl w-full space-y-8 mt-20">
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-indigo-900">✍️ Manual Table Builder</h1>
                    <p className="text-gray-600 mt-2">Add columns and rows to build your custom table.</p>
                </div>

                <div className="bg-gray-50 p-6 rounded-xl shadow">
                    <h2 className="text-xl font-semibold text-indigo-900 mb-4">📄 File Details</h2>

                    <div className="flex items-center gap-4">
                        <label className="text-indigo-900 font-medium min-w-[100px]">File Name:</label>
                        <input
                            type="text"
                            placeholder="Enter file name"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-indigo-900 text-indigo-900"
                        />
                    </div>

                    <div className="mt-4 border-t pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Category *</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => {
                                        setSelectedCategory(e.target.value);
                                        setSelectedSubcategory("");
                                    }}
                                    className="w-full rounded border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-900"
                                >
                                    <option value="">Select category</option>
                                    {CATEGORY_OPTIONS.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Subcategory *</label>
                                <select
                                    value={selectedSubcategory}
                                    onChange={(e) => setSelectedSubcategory(e.target.value)}
                                    disabled={!selectedCategory || availableSubcategories.length === 0}
                                    className="w-full rounded border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-900 disabled:opacity-60"
                                >
                                    <option value="">
                                        {selectedCategory ? "Select subcategory" : "Select category first"}
                                    </option>
                                    {availableSubcategories.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
                            {/* Columns */}
                            <div className="bg-gray-50 p-6 rounded-xl shadow">
                                <h2 className="text-xl font-semibold text-indigo-900 mb-4">🧱 Columns</h2>
                                <div className="space-y-3">
                                    {columns.map((col, index) => (
                                        <input
                                            key={index}
                                            type="text"
                                            placeholder={`Column ${index + 1}`}
                                            value={col}
                                            onChange={(e) => updateColumn(index, e.target.value)}
                                            className="w-full border border-gray-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-indigo-900 text-indigo-900"
                                        />
                                    ))}
                                </div>
                                <button
                                    onClick={addColumn}
                                    className="mt-4 w-full bg-indigo-900 text-white font-medium py-2 rounded-md hover:bg-indigo-800 transition"
                                    type="button"
                                >
                                    ➕ Add Column
                                </button>
                            </div>

                            {/* Rows */}
                            <div className="bg-gray-50 p-6 rounded-xl shadow">
                                <h2 className="text-xl font-semibold text-indigo-900 mb-4">📥 Rows</h2>
                                <div className="space-y-3 overflow-x-auto">
                                    {rows.map((row, rowIndex) => (
                                        <div key={rowIndex} className="flex flex-wrap gap-2">
                                            {columns.map((_, colIndex) => (
                                                <input
                                                    key={colIndex}
                                                    type="text"
                                                    placeholder={columns[colIndex] || `Col ${colIndex + 1}`}
                                                    value={row[colIndex] || ""}
                                                    onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                                    className="flex-1 min-w-[120px] border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-900 text-indigo-900"
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={addRow}
                                    className="mt-4 w-full bg-indigo-900 text-white font-medium py-2 rounded-md hover:bg-indigo-800 transition"
                                    type="button"
                                >
                                    ➕ Add Row
                                </button>
                            </div>
                        </div>

                        {/* Table Preview */}
                        <div className="bg-white p-6 rounded-xl shadow overflow-x-auto mt-6">
                            <h2 className="text-xl font-semibold text-indigo-900 mb-4">📊 Live Table Preview</h2>
                            <table className="min-w-full border border-gray-300 text-sm text-left">
                                <thead className="bg-indigo-100">
                                    <tr>
                                        {columns.map((col, index) => (
                                            <th key={index} className="px-4 py-2 text-indigo-900 border border-gray-300">
                                                {col || `Column ${index + 1}`}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="hover:bg-gray-50">
                                            {columns.map((_, colIndex) => (
                                                <td key={colIndex} className="px-4 py-2 border border-gray-300">
                                                    {row[colIndex] || ""}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Save Button */}
                        <div className="text-center mt-6">
                            <button
                                disabled={loading}
                                onClick={handleSave}
                                className={`mt-6 px-6 py-3 rounded-md font-semibold text-white transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-900 hover:bg-indigo-800"
                                    }`}
                                type="button"
                            >
                                {loading ? "Saving..." : "💾 Save Table"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ManualGenerateTable() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-white flex items-center justify-center">
                    Loading table builder...
                </div>
            }
        >
            <ManualGenerateTableWithParams />
        </Suspense>
    );
}