"use client";
import { FileUpload } from "@/component-app/ui/file-upload";
import { FaLock } from "react-icons/fa";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useState, useEffect, Suspense } from "react";
import { Hourglass } from "ldrs/react";
import "ldrs/react/Hourglass.css";
import {
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalTrigger,
} from "@/component-app/ui/animated-modal";

interface UploadStatus {
    success: boolean;
    message: string;
}

interface SessionMetadata {
    combineData: boolean;
    createNewTable: boolean;
    joinType: string;
    customPrompt: string;
    newTableName: string;
    isReadOnly: boolean;
    category?: string;
    subcategory?: string;
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unknown error occurred";
}

// Predefined base subcategories (fallback when /api/subcategories doesn't return custom ones)
const BASE_SUBCATS: Record<string, string[]> = {
    "Company Tables": ["Products", "Customers"],
    "Parameters": ["Pricing Parameters", "Tax Rates"],
    "Transactions": ["Historical Transactions"],
    "Other Tables": ["Uncategorized"],
    "Price Lists": ["General"],
};

const CATEGORY_OPTIONS = [
    "Company Tables",
    "Parameters",
    "Transactions",
    "Other Tables",
    // keep Price Lists as internal category (for price-list flows)
    "Price Lists"
];

function FileUploadDemoWithParams() {
    const searchParams = useSearchParams();
    const isPriceList = searchParams.get('purpose') === 'price-list';
    return <FileUploadDemoContent isPriceList={isPriceList} />;
}

function FileUploadDemoContent({ isPriceList }: { isPriceList: boolean }) {
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [combineData, setCombineData] = useState(false);
    const [customPromptEnabled, setCustomPromptEnabled] = useState(false);
    const [customPrompt, setCustomPrompt] = useState("");
    const [selectedJoin, setSelectedJoin] = useState("");
    const [sessionId, setSessionId] = useState("");
    const router = useRouter();
    const [isProcessing, setIsProcessing] = useState(false);
    const [metadataSaved, setMetadataSaved] = useState(false);
    const [createNewTable, setCreateNewTable] = useState(false);
    const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
    const [newTableName, setNewTableName] = useState(""); // New state for table name

    // Manual category states
    const [selectedCategory, setSelectedCategory] = useState<string | "">("");
    const [selectedSubcategory, setSelectedSubcategory] = useState<string | "">("");
    const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([]);

    useEffect(() => {
        if (files.length < 2 && combineData) {
            setCombineData(false);
        }
    }, [files, combineData]);

    useEffect(() => {
        // When category changes, load either custom subcategories or fallback base ones
        async function fetchSubcats() {
            if (!selectedCategory) {
                setAvailableSubcategories([]);
                setSelectedSubcategory("");
                return;
            }

            try {
                const res = await fetch("/api/subcategories");
                if (res.ok) {
                    const subs = await res.json(); // expected: array of { category, subcategory }
                    const filtered = subs
                        .filter((s: any) => s.category === selectedCategory)
                        .map((s: any) => s.subcategory);
                    if (filtered.length > 0) {
                        setAvailableSubcategories(filtered);
                        setSelectedSubcategory((prev) => (filtered.includes(prev) ? prev : filtered[0]));
                        return;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch custom subcategories", err);
            }

            // Fallback to base list
            const fallback = BASE_SUBCATS[selectedCategory] || [];
            setAvailableSubcategories(fallback);
            setSelectedSubcategory(fallback[0] || "");
        }

        fetchSubcats();
    }, [selectedCategory]);

    const handleFilesChange = (newFiles: File[]) => {
        setFiles((prev) => [
            ...prev,
            ...newFiles.filter(
                (f) => !prev.some((p) => p.name === f.name && p.size === f.size)
            ),
        ]);
        setUploadStatus(null);
    };

    const handleSelect = (option: string) => {
        setSelectedJoin(option);
    };

    const handleUploadAll = async () => {
        if (files.length === 0) return;
        setLoading(true);
        setUploadStatus(null);

        const newSessionId = generateSessionId();
        setSessionId(newSessionId);

        const uploadedIds: string[] = [];
        const statusList: UploadStatus[] = [];

        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("sessionId", newSessionId);
            formData.append("isPriceList", isPriceList.toString());
            formData.append("isReadOnly", isReadOnly.toString());

            try {
                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                    credentials: "include"
                });
                const json = await res.json();
                if (res.ok) {
                    statusList.push({ success: true, message: json.message });
                    uploadedIds.push(json.fileId);
                } else {
                    statusList.push({ success: false, message: json.error });
                }
            } catch {
                statusList.push({
                    success: false,
                    message: "Network error uploading " + file.name,
                });
            }
        }
        setUploadedFileIds(uploadedIds);

        for (const id of uploadedIds) {
            fetch(`/api/categorize?fileId=${id}`, {
                method: 'GET',
                credentials: 'include',
            })
                .then(res => {
                    if (!res.ok) console.error('Categorization error for', id, res.status);
                })
                .catch(err => console.error('Categorization failed for', id, err));
        }

        const anyFail = statusList.some((s) => !s.success);
        setUploadStatus({
            success: !anyFail,
            message: statusList
                .map((s, i) => `${files[i].name}: ${s.message}`)
                .join("\n"),
        });
        setLoading(false);
    };

    const handleCombineAndRedirect = async () => {
        setIsProcessing(true);
        try {
            const filesToUpdate = [...uploadedFileIds];

            // Process combined file if needed
            if (combineData) {
                const response = await fetch('/api/combine', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cookie': document.cookie
                    },
                    body: JSON.stringify({
                        sessionId,
                        isReadOnly,
                        newTableName // Pass new table name to API
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to process files');

                if (data.combinedFileId) {
                    filesToUpdate.push(data.combinedFileId);

                    try {
                        await fetch(`/api/categorize?fileId=${data.combinedFileId}`, {
                            method: 'GET',
                            credentials: 'include',
                        });
                    } catch (err) {
                        console.error('Combined file categorization error', err);
                    }
                }
            }

            // Categorize individual files
            await Promise.allSettled(
                uploadedFileIds.map(id =>
                    fetch(`/api/categorize?fileId=${id}`, {
                        method: 'GET',
                        credentials: 'include',
                    })
                )
            );

            router.push('/app-pages/dashboard');
        } catch (error) {
            console.error('Combine error:', error);
            alert(`Error: ${getErrorMessage(error)}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveSessionMetadata = async () => {
        // Validate new table name if needed
        if ((combineData || createNewTable) && !newTableName.trim()) {
            alert("Please suggest a name for the new table");
            return false;
        }

        const metadata: SessionMetadata = {
            combineData,
            createNewTable,
            joinType: selectedJoin,
            isReadOnly,
            customPrompt: customPromptEnabled ? customPrompt : "",
            newTableName: newTableName.trim(), // Add to metadata
            category: selectedCategory || undefined,
            subcategory: selectedSubcategory || undefined,
        };

        try {
            const res = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, metadata })
            });

            if (res.ok) {
                setMetadataSaved(true);

                // If user selected a manual category, immediately persist to uploaded files (override AI)
                if (selectedCategory && uploadedFileIds.length > 0) {
                    try {
                        const updateRes = await fetch("/api/update-category", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({
                                fileIds: uploadedFileIds,
                                category: selectedCategory,
                                subcategory: selectedSubcategory || (BASE_SUBCATS[selectedCategory]?.[0] ?? "")
                            })
                        });

                        if (!updateRes.ok) {
                            const err = await updateRes.json().catch(() => null);
                            console.error("Failed to update category for files:", err);
                            alert("Saved session but failed to update file category. Check console.");
                        }
                    } catch (err) {
                        console.error("Update-category call failed:", err);
                    }
                }

                return true;
            } else {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save metadata");
            }
        } catch (error) {
            console.error("Error saving metadata:", error);
            alert(`Failed to save requirements: ${getErrorMessage(error)}`);
            return false;
        }
    };

    const handleClear = () => {
        setFiles([]);
        setUploadStatus(null);
    };

    return (
        <div className="w-full max-w-4xl mx-auto min-h-96 border border-dashed bg-white border-indigo-900 rounded-lg m-20 mt-[10rem]">
            {isPriceList && (
                <div className="p-4 bg-indigo-100 text-indigo-900 text-center">
                    Creating Price List - Files will be categorized under Price Lists
                </div>
            )}
            <FileUpload files={files} onChange={handleFilesChange} />
            <div className="p-4 border-b border-indigo-200">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="readOnlyToggle"
                        checked={isReadOnly}
                        onChange={(e) => setIsReadOnly(e.target.checked)}
                        className="size-5 rounded border-gray-300 shadow-sm"
                    />
                    <label htmlFor="readOnlyToggle" className="text-gray-700 font-medium flex items-center gap-2">
                        Mark all files as Read-Only <FaLock className="text-red-500" />
                    </label>
                </div>

            </div>
            <div className="mt-4 flex gap-4 m-5">
                <button
                    onClick={handleUploadAll}
                    disabled={loading || files.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-900 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                    Upload
                </button>

                <button
                    onClick={handleClear}
                    disabled={loading || files.length === 0}
                    className="px-4 py-2 border border-red-500 text-red-500 rounded hover:bg-red-100 disabled:opacity-50"
                >
                    Clear
                </button>
            </div>

            {loading && (
                <div className="m-6 flex flex-col items-center">
                    <Hourglass size="40" bgOpacity="0.1" speed="1.75" color="#312e81" />
                </div>
            )}

            {uploadStatus && !loading && (
                <div className="mt-6 text-center">
                    <p className={`${uploadStatus.success ? "text-green-600" : "text-red-600"}`}>
                        {uploadStatus.message}
                    </p>

                    {uploadStatus.success && (
                        <div className="py-5 flex items-center justify-center">
                            <Modal>
                                <ModalTrigger className="bg-black text-white flex justify-center group/modal-btn">
                                    <span className="px-5 group-hover/modal-btn:translate-x-40 text-center transition duration-500">
                                        Done
                                    </span>
                                    <div className="-translate-x-40 group-hover/modal-btn:translate-x-0 flex items-center justify-center absolute inset-0 transition duration-500 text-white z-20">
                                        📊
                                    </div>
                                </ModalTrigger>
                                <ModalBody>
                                    <ModalContent className="max-h-[65vh] overflow-y-auto pr-2 pb-4">
                                        <h4 className="text-lg md:text-2xl text-neutral-600 font-bold text-center mb-8">
                                            Help us understand your {" "}
                                            <span className="px-1 py-0.5 rounded-md bg-gray-100 border border-gray-200">
                                                requirement
                                            </span>{" "}
                                            more! 📊
                                        </h4>
                                        <div className="mt-4 flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="combine"
                                                checked={combineData}
                                                onChange={(e) => files.length >= 2 && setCombineData(e.target.checked)}
                                                disabled={files.length < 2}
                                                className={`size-5 rounded border-gray-300 shadow-sm ${files.length < 2 ? 'opacity-50 cursor-not-allowed' : ''
                                                    }`}
                                            />
                                            <label
                                                htmlFor="combine"
                                                className={`text-gray-700 font-medium ${files.length < 2 ? 'opacity-50' : ''
                                                    }`}
                                            >
                                                Do you want to combine the data?
                                                {files.length < 2 && (
                                                    <span className="text-xs text-red-500 block">
                                                        (Requires 2+ files)
                                                    </span>
                                                )}
                                            </label>
                                        </div>

                                        {combineData && (
                                            <span className="block mt-4 text-sm text-indigo-900 font-medium">
                                                <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-indigo-900 font-medium">
                                                    {["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN"].map((option, index) => (
                                                        <button
                                                            key={index}
                                                            className={`border rounded px-2 py-1 transition ${selectedJoin === option
                                                                ? "bg-indigo-500 text-white border-indigo-500"
                                                                : "border-indigo-500 hover:bg-indigo-100 text-indigo-900"
                                                                }`}
                                                            onClick={() => handleSelect(option)}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            </span>
                                        )}
                                        <div className="mt-6 flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="customPrompt"
                                                checked={customPromptEnabled}
                                                onChange={(e) => setCustomPromptEnabled(e.target.checked)}
                                                className="size-5 rounded border-gray-300 shadow-sm text-indigo-900"
                                            />
                                            <label htmlFor="customPrompt" className="text-gray-700 font-medium">
                                                Use custom prompt
                                            </label>
                                        </div>

                                        {customPromptEnabled && (
                                            <div className="mt-4">
                                                <textarea
                                                    value={customPrompt}
                                                    onChange={(e) => setCustomPrompt(e.target.value)}
                                                    placeholder="Anything that helps our AI model do your task more efficiently"
                                                    className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32 text-indigo-900"
                                                />
                                            </div>
                                        )}
                                        <div className="mt-4 flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="readOnly"
                                                checked={isReadOnly}
                                                onChange={(e) => setIsReadOnly(e.target.checked)}
                                                className="size-5 rounded border-gray-300 shadow-sm"
                                            />
                                            <label htmlFor="readOnly" className="text-gray-700 font-medium flex items-center gap-2">
                                                Mark as Read-Only <FaLock className="text-red-500" />
                                            </label>
                                        </div>



                                        <div className="mt-4 flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="createNewTable"
                                                checked={createNewTable}
                                                onChange={(e) => {
                                                    setCreateNewTable(e.target.checked);
                                                    if (e.target.checked) setCombineData(false);
                                                }}
                                                className="size-5 rounded border-gray-300 shadow-sm"
                                                disabled={combineData}
                                            />
                                            <label htmlFor="createNewTable" className="text-gray-700 font-medium">
                                                Create a new table linking the files
                                            </label>
                                        </div>

                                        {/* New Table Name Input */}
                                        {(combineData || createNewTable) && (
                                            <div className="mt-4">
                                                <label
                                                    htmlFor="newTableName"
                                                    className="block text-gray-700 font-medium mb-2"
                                                >
                                                    Suggest a name for the new table
                                                </label>
                                                <input
                                                    type="text"
                                                    id="newTableName"
                                                    value={newTableName}
                                                    onChange={(e) => setNewTableName(e.target.value)}
                                                    className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-900"
                                                    placeholder="Enter a name for the new table"
                                                    required
                                                />
                                            </div>
                                        )}
                                        {/* New Manual Category Section */}
                                        <div className="mt-6 border rounded p-4 bg-gray-50 text-indigo-900">
                                            <p className="text-sm font-medium text-gray-700 mb-2">
                                                Manually choose category (optional)
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs text-gray-600 mb-1">Category</label>
                                                    <select
                                                        value={selectedCategory}
                                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                                        className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="">(Keep AI choice)</option>
                                                        {CATEGORY_OPTIONS.map((c) => (
                                                            <option key={c} value={c}>
                                                                {c}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs text-gray-600 mb-1">Subcategory</label>
                                                    <select
                                                        value={selectedSubcategory}
                                                        onChange={(e) => setSelectedSubcategory(e.target.value)}
                                                        disabled={!selectedCategory || availableSubcategories.length === 0}
                                                        className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                                                    >
                                                        <option value="">{selectedCategory ? "(Select subcategory)" : "(N/A)"}</option>
                                                        {availableSubcategories.map((s) => (
                                                            <option key={s} value={s}>
                                                                {s}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                        </div>

                                    </ModalContent>
                                    <ModalFooter className="gap-4">
                                        <button
                                            onClick={saveSessionMetadata}
                                            disabled={isProcessing || metadataSaved}
                                            className="group mt-4 mx-auto flex w-fit items-center justify-between gap-4 rounded-lg border border-indigo-900 bg-indigo-900 px-6 py-2 transition-colors hover:bg-transparent focus:ring-3 focus:outline-none disabled:opacity-50"
                                        >
                                            {metadataSaved ? (
                                                <span className="font-medium text-green-400 flex items-center gap-2">
                                                    ✓ Saved
                                                </span>
                                            ) : (
                                                <span className="font-medium text-white transition-colors group-hover:text-indigo-900">
                                                    Save Requirements
                                                </span>
                                            )}
                                        </button>

                                        <button
                                            onClick={handleCombineAndRedirect}
                                            disabled={isProcessing || !metadataSaved}
                                            className="group mt-4 mx-auto flex w-fit items-center justify-between gap-4 rounded-lg border border-indigo-900 bg-indigo-900 px-6 py-2 transition-colors focus:ring-3 focus:outline-none disabled:opacity-50"
                                        >
                                            {isProcessing ? (
                                                <span className="font-medium text-white flex items-center gap-2">
                                                    <Hourglass size="20" bgOpacity="0.1" speed="1.75" color="white" />
                                                    Processing...
                                                </span>
                                            ) : (
                                                <span className="font-medium text-white transition-colors">
                                                    Done
                                                </span>
                                            )}
                                        </button>
                                    </ModalFooter>
                                </ModalBody>
                            </Modal>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function FileUploadDemo() {
    return (
        <Suspense fallback={
            <div className="w-full max-w-4xl mx-auto min-h-96 flex items-center justify-center">
                <Hourglass size="40" bgOpacity="0.1" speed="1.75" color="#312e81" />
            </div>
        }>
            <FileUploadDemoWithParams />
        </Suspense>
    );
}