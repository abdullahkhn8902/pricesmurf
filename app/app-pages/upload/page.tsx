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
    joinType: string;
    customPrompt: string;
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "An unknown error occurred";
}

// Component that uses useSearchParams
function FileUploadDemoWithParams() {
    const searchParams = useSearchParams();
    const isPriceList = searchParams.get('purpose') === 'price-list';
    return <FileUploadDemoContent isPriceList={isPriceList} />;
}

// Main component content
function FileUploadDemoContent({ isPriceList }: { isPriceList: boolean }) {
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
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);

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
            formData.append("isReadOnly", isReadOnly.toString());
            formData.append("isPriceList", isPriceList.toString());

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
            const response = await fetch('/api/combine', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': document.cookie
                },
                body: JSON.stringify({ sessionId })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to process files');

            if (data.combinedFileId) {
                try {
                    const catRes = await fetch(`/api/categorize?fileId=${data.combinedFileId}`, {
                        method: 'GET',
                        credentials: 'include',
                    });

                    if (!catRes.ok) {
                        console.error('Combined file categorization failed', catRes.status);
                    }
                } catch (err) {
                    console.error('Combined file categorization error', err);
                }
            }

            const categorizePromises = uploadedFileIds.map(id =>
                fetch(`/api/categorize?fileId=${id}`, {
                    method: 'GET',
                    credentials: 'include',
                })
            );

            await Promise.allSettled(categorizePromises);
            router.push('/app-pages/dashboard');
        } catch (error) {
            console.error('Combine error:', error);
            alert(`Error: ${getErrorMessage(error)}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const saveSessionMetadata = async () => {
        const metadata = {
            combineData,
            createNewTable,
            joinType: selectedJoin,
            isReadOnly,
            customPrompt: customPromptEnabled ? customPrompt : ""
        };

        try {
            const res = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, metadata })
            });

            if (res.ok) {
                setMetadataSaved(true);
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
                                    <ModalContent>
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
                                                onChange={(e) => setCombineData(e.target.checked)}
                                                className="size-5 rounded border-gray-300 shadow-sm"
                                            />
                                            <label htmlFor="combine" className="text-gray-700 font-medium">
                                                Do you want to combine the data?
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
                                                className="size-5 rounded border-gray-300 shadow-sm"
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
                                                    className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32"
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

// Default export with Suspense boundary
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