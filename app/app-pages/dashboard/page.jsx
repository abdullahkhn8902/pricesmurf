"use client";
import { useState, useEffect } from 'react'
import { Sidebar, SidebarBody, SidebarLink } from "@/component-app/ui/sidebar";
import {
    IconBrandTabler,
} from "@tabler/icons-react";
import {
    SignedIn,
    UserButton,
    useUser
} from '@clerk/nextjs';
import { FaFileExcel } from "react-icons/fa";
import { Hourglass } from "ldrs/react";
import "ldrs/react/Hourglass.css";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
// import { Logo } from '../../component-app/Logo';



export default function SidebarDemo() {
    const [isClient, setIsClient] = useState(false)
    const { user, isLoaded } = useUser();
    useEffect(() => {
        setIsClient(true)
    }, [])


    const links = [
        {
            label: "Dashboard",
            href: "/app-pages/dashboard",
            icon: (
                <IconBrandTabler className="h-5 w-5 shrink-0 text-white dark:text-neutral-200" />
            ),
        },
        {
            label: "Upload a file",
            href: "/app-pages/upload",
            icon: (
                <FaFileExcel className="h-5 w-5 shrink-0 text-white dark:text-neutral-200" />
            ),
        }
    ];
    const [open, setOpen] = useState(false);

    return (
        <div
            className={cn(
                "mx-auto flex w-screen flex-1 flex-col overflow-hidden rounded-md border border-neutral-200 bg-gray-100 md:flex-row dark:border-neutral-700 dark:bg-neutral-800  ",
                "h-screen ",
            )}
        >
            <Sidebar open={open} setOpen={setOpen}>
                <SidebarBody className="justify-between gap-10">
                    <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto ">
                        {/* {open ? <Logo isIcon={false} /> : <Logo isIcon={true} />} */}
                        <div className="mt-8 flex flex-col gap-2 ">
                            {links.map((link, idx) => (
                                <SidebarLink key={idx} link={link} />
                            ))}
                            <div className="flex items-center gap-2  py-2 cursor-pointer text-white hover:bg-neutral-700 rounded">
                                <SignedIn>
                                    <UserButton
                                        appearance={{
                                            elements: {
                                                userButtonBox: "flex items-center gap-2",
                                                userButtonTrigger: "hover:bg-gray-100 rounded-full"
                                            }
                                        }}
                                    />
                                    {isLoaded ? <span>{user?.fullName || "User"}</span> : null}
                                </SignedIn>
                            </div>
                        </div>
                    </div>
                </SidebarBody>
            </Sidebar>
            <Dashboard />
        </div>
    );
}



const Dashboard = () => {
    const [isClient, setIsClient] = useState(false);
    const [files, setFiles] = useState([]);
    const [selectedFileId, setSelectedFileId] = useState('');
    const [sheetName, setSheetName] = useState('Sheet# 1');
    const [columns, setColumns] = useState([]);
    const [data, setData] = useState([]);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editData, setEditData] = useState({});
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [analysis, setAnalysis] = useState('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);


    const sanitizeColumnName = (name) => {
        return (name || '').toString().replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed';
    };


    useEffect(() => {
        setIsClient(true);
        // Fetch list of files
        setIsLoading(true);
        fetch('/api/files')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch files');
                return res.json();
            })
            .then(files => {
                setFiles(files);
                if (files.length > 0) {
                    setSelectedFileId(files[0].id);
                }
                setError('');
            })
            .catch(err => {
                setError('Error fetching files. Please try again.');
                console.error('Error fetching files:', err);
            })
            .finally(() => setIsLoading(false));
    }, []);

    useEffect(() => {
        const fetchFileData = async () => {
            if (!selectedFileId) return;

            setIsLoading(true);
            try {
                const res = await fetch(`/api/files?id=${selectedFileId}`);
                if (!res.ok) throw new Error('Failed to fetch file data');
                const { sheetName, columns, data, analysis } = await res.json();

                setSheetName(sheetName || 'Sheets');
                setColumns((columns || []).map(sanitizeColumnName));
                setData(data || []);
                setAnalysis(analysis || '');
                setError('');
            } catch (err) {
                setError('Error fetching file data. Please try again.');
                console.error('Error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFileData();
    }, [selectedFileId]);

    const handleEdit = (index) => {
        setEditingIndex(index);
        setEditData(data[index]);
    };
    const handleAnalyze = async (customPrompt = '') => {
        if (!selectedFileId) {
            setAnalysisError('No file selected');
            return;
        }

        setIsAnalysisLoading(true);
        setAnalysisError('');
        try {
            const response = await fetch(`/api/analyze?fileId=${selectedFileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customPrompt }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Analysis failed');

            setAnalysis(result.analysis);
            fetchFiles(); // Refresh analysis data
        } catch (err) {
            setAnalysisError(err.message);
        } finally {
            setIsAnalysisLoading(false);
            setShowCustomPromptModal(false);
        }
    };

    const handleCustomAnalyze = () => setShowCustomPromptModal(true);
    const handlePromptSubmit = () => handleAnalyze(customPrompt);

    const handleSave = () => {
        if (editingIndex === null || editingIndex >= data.length) {
            setError('Cannot save: Invalid row index');
            return;
        }

        const updatedData = [...data];
        updatedData[editingIndex] = editData;
        setData(updatedData);

        setEditingIndex(null);
        setEditData({});
        setError('');
    };

    const handleSaveChanges = async () => {
        if (!selectedFileId) {
            setError('No file selected');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`/api/update?id=${selectedFileId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sheetName, columns, data }),
            });

            if (!response.ok) {
                throw new Error('Failed to save changes');
            }

            setError('');
            alert('Changes saved successfully');
        } catch (err) {
            setError('Error saving changes. Please try again.');
            console.error('Error saving changes:', err);
        } finally {
            setIsLoading(false);
        }
    };




    const handleRemove = (index) => {
        const updatedData = data.filter((_, i) => i !== index);
        setData(updatedData);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setEditData((prevData) => ({ ...prevData, [name]: value }));
    };

    return (
        <div className="flex flex-1">
            <div className="flex w-full flex-1 flex-col gap-2 rounded-tl-2xl border border-neutral-200 bg-gray-200 p-2 md:p-10 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="flex justify-between items-center mt-2 px-4">
                    <div className="text-xl font-bold text-center w-full">{sheetName}</div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCustomAnalyze}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        >
                            Custom Analyze
                        </button>

                        <button
                            onClick={handleSaveChanges}
                            disabled={isLoading}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
                {showCustomPromptModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
                            <h3 className="text-lg font-semibold mb-4">Custom Analysis Prompt</h3>
                            <textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="Enter your custom analysis instructions..."
                                className="w-full h-40 p-3 border rounded-lg mb-4"
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowCustomPromptModal(false)}
                                    className="px-4 py-2 bg-gray-300 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePromptSubmit}
                                    disabled={isAnalysisLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                                >
                                    {isAnalysisLoading ? 'Analyzing...' : 'Run Analysis'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Analysis Display Section */}
                {analysis && (
                    <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
                        <h3 className="text-lg font-semibold mb-2">AI Analysis</h3>
                        <div className="whitespace-pre-line text-gray-700">
                            {analysis}
                        </div>
                        <button
                            onClick={() => setAnalysis('')}
                            className="mt-2 text-red-600 hover:text-red-700"
                        >
                            Close Analysis
                        </button>
                    </div>
                )}

                <div className="mx-auto w-full md:w-[40rem] lg:w-[55rem] xl:w-[80rem] mt-4">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
                        <select
                            value={selectedFileId}
                            onChange={(e) => setSelectedFileId(e.target.value)}
                            className="w-full border rounded-lg p-2"
                            disabled={isLoading}
                        >
                            <option value="">Select a file</option>
                            {files.map(file => (
                                <option key={file.id} value={file.id}>{file.filename}</option>
                            ))}
                        </select>
                    </div>
                    {isLoading && (
                        <div className="flex justify-center mt-20">
                            <Hourglass size="40" bgOpacity="0.1" speed="1.75" color="#312e81" />
                        </div>
                    )}
                    {error && <div className="text-center text-red-600 mb-4">{error}</div>}
                    {!isLoading && !error && (
                        <div className="relative overflow-auto shadow-md sm:rounded-lg max-h-[80vh]">
                            <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                                    <tr>
                                        {columns.map((header) => (
                                            <th key={header} className="px-6 py-3">{header}</th>
                                        ))}
                                        <th className="px-6 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((row, index) => (
                                        <tr key={index} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                            {columns.map((col) => (
                                                <td key={col} className="px-6 py-4">{row[col] || ''}</td>
                                            ))}
                                            <td className="px-6 py-4 space-x-3">
                                                <button onClick={() => handleEdit(index)} className="font-medium text-blue-600 dark:text-blue-500 hover:underline">Edit</button>
                                                <button onClick={() => handleRemove(index)} className="font-medium text-red-600 dark:text-red-500 hover:underline">Remove</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {editingIndex !== null && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto ">
                        <div className="bg-white p-5 rounded-lg shadow-lg w-full max-w-md overflow-y-auto">
                            <h3 className="text-lg font-semibold mb-4">Edit Details</h3>
                            {columns.map((key) => (
                                <div key={key} className="mb-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{key}</label>
                                    <input
                                        type="text"
                                        name={key}
                                        value={editData[key] || ''}
                                        onChange={handleChange}
                                        className="w-full border rounded-lg p-2"
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end space-x-2">
                                <button onClick={() => setEditingIndex(null)} className="px-4 py-2 bg-gray-300 rounded-lg">Cancel</button>
                                <button
                                    disabled={editingIndex === null}
                                    onClick={handleSave}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
