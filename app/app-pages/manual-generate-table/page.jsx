"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ManualGenerateTableWithParams() {
    const searchParams = useSearchParams();
    const isPriceList = searchParams.get('purpose') === 'price-list';
    return <ManualGenerateTableContent isPriceList={isPriceList} />;
}

function ManualGenerateTableContent({ isPriceList }) {
    const [columns, setColumns] = useState([""]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("Saving...");
    const [fileName, setFileName] = useState(""); // New state for file name
    const router = useRouter();

    const addColumn = () => setColumns([...columns, ""]);
    const updateColumn = (index, value) => {
        const newCols = [...columns];
        newCols[index] = value;
        setColumns(newCols);
    };

    const addRow = () => {
        const newRow = columns.map(() => "");
        setRows([...rows, newRow]);
    };

    const updateCell = (rowIndex, colIndex, value) => {
        const newRows = [...rows];
        newRows[rowIndex][colIndex] = value;
        setRows(newRows);
    };

    const generateSessionId = () => {
        return Math.random().toString(36).substring(2, 10);
    };

    const triggerCategorization = async (fileId) => {
        setLoadingMessage("Categorizing file...");
        try {
            const response = await fetch(`/api/categorize?fileId=${fileId}`, {
                method: 'GET',
                credentials: 'include',
            });

            if (!response.ok) {
                console.error('Categorization failed', response.status);
            }
        } catch (error) {
            console.error('Categorization error', error);
        }
    };

    const handleSave = async () => {
        if (columns.length === 0) {
            alert("Add at least one column before saving!");
            return;
        }
        if (!fileName.trim()) {
            alert("Please enter a file name");
            return;
        }
        setLoading(true);
        setLoadingMessage("Saving...");

        try {
            // Convert table data to CSV string
            const csvHeader = columns.join(",");
            const csvRows = rows
                .map((row) =>
                    row
                        .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
                        .join(",")
                )
                .join("\n");

            const csvContent = csvHeader + "\n" + csvRows;

            // Create a File from CSV string
            const blob = new Blob([csvContent], { type: "text/csv" });
            const file = new File([blob], `${fileName.trim()}.csv`, {
                type: "text/csv",
            });

            // Prepare FormData and upload to API
            const formData = new FormData();
            formData.append("file", file);
            formData.append("sessionId", generateSessionId());
            formData.append("isPriceList", isPriceList.toString());

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Upload failed");
            }

            const result = await res.json();
            const fileId = result.fileId;

            // Trigger categorization after successful upload
            await triggerCategorization(fileId);

            // Success! Redirect to dashboard
            router.push("/app-pages/dashboard");
        } catch (error) {
            alert("Upload failed: " + error.message);
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
            <div className="max-w-6xl w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-bold text-indigo-900">
                        ✍️ Manual Table Builder
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Add columns and rows to build your custom table.
                    </p>
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
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                                            onChange={(e) =>
                                                updateCell(rowIndex, colIndex, e.target.value)
                                            }
                                            className="flex-1 min-w-[120px] border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-900 text-indigo-900"
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={addRow}
                            className="mt-4 w-full bg-indigo-900 text-white font-medium py-2 rounded-md hover:bg-indigo-800 transition"
                        >
                            ➕ Add Row
                        </button>
                    </div>
                </div>

                {/* Table Preview */}
                <div className="bg-white p-6 rounded-xl shadow overflow-x-auto">
                    <h2 className="text-xl font-semibold text-indigo-900 mb-4">📊 Live Table Preview</h2>
                    <table className="min-w-full border border-gray-300 text-sm text-left">
                        <thead className="bg-indigo-100">
                            <tr>
                                {columns.map((col, index) => (
                                    <th
                                        key={index}
                                        className="px-4 py-2 text-indigo-900 border border-gray-300"
                                    >
                                        {col || `Column ${index + 1}`}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50">
                                    {row.map((cell, colIndex) => (
                                        <td
                                            key={colIndex}
                                            className="px-4 py-2 border border-gray-300"
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Save Button */}
                <div className="text-center">
                    <button
                        disabled={loading}
                        onClick={handleSave}
                        className={`mt-6 px-6 py-3 rounded-md font-semibold text-white transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-900 hover:bg-indigo-800"
                            }`}
                    >
                        {loading ? loadingMessage : "💾 Save Table"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ManualGenerateTable() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center">Loading table builder...</div>}>
            <ManualGenerateTableWithParams />
        </Suspense>
    );
}