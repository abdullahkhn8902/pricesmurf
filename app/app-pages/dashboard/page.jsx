"use client";
import { useState, useEffect, useRef, Suspense } from 'react'
import { Sidebar, SidebarBody, SidebarLink } from "@/component-app/ui/sidebar";
import Modal from "@/component-app/ui/Modal";
import {
    IconBrandTabler,
    IconFolder,
    IconBuilding,
    IconSettings,
    IconHistory,
    IconFile,
    IconPlus,
    IconCurrencyDollar
} from "@tabler/icons-react";
import {
    SignedIn,
    UserButton,
    useUser
} from '@clerk/nextjs';
import { FaExchangeAlt } from "react-icons/fa";
import { FaFileUpload } from "react-icons/fa";
import { FaChartLine } from "react-icons/fa";
import { FaBuilding } from "react-icons/fa6";
import { Hourglass } from "ldrs/react";
import "ldrs/react/Hourglass.css";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// Register Hourglass component

// Create inner component for Sidebar that uses useSearchParams
function SidebarContent() {
    const [newSubcategoryModal, setNewSubcategoryModal] = useState({ open: false, category: '' });
    const [newSubcategoryName, setNewSubcategoryName] = useState('');

    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isClient, setIsClient] = useState(false)
    const [open, setOpen] = useState(false);
    const { user, isLoaded } = useUser();
    const [sidebarData, setSidebarData] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState({
        'Company Tables': false,
        'Parameters': false,
        'Transactions': false,
        'Other Tables': false,
        'Price Lists': false
    });
    const [loading, setLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [lastFetchTime, setLastFetchTime] = useState(0);
    const initialLoadRef = useRef(true);

    useEffect(() => {
        setIsClient(true);

        if (initialLoadRef.current || open) {
            fetchSidebarData();
            initialLoadRef.current = false;
        }

        if (!open) {
            setExpandedCategories({
                'Company Tables': false,
                'Parameters': false,
                'Transactions': false,
                'Other Tables': false,
                'Price Lists': false
            });
        }

        const fileId = searchParams.get('file');
        if (fileId) setSelectedFile(fileId);
    }, [open]);



    const fetchSidebarData = async () => {
        try {
            // Fetch files
            const res = await fetch('/api/files?metadata=1');
            if (!res.ok) throw new Error('Failed to fetch files');
            const files = await res.json();

            // Fetch custom subcategories
            let customSubs = [];
            try {
                const customRes = await fetch('/api/subcategories');
                if (customRes.ok) {
                    customSubs = await customRes.json();
                    console.log('Fetched custom subcategories:', customSubs);
                } else {
                    console.error('Failed to fetch subcategories:', customRes.status);
                }
            } catch (err) {
                console.error('Error fetching subcategories:', err);
            }

            // Initialize organizedData with predefined structure
            const organizedData = {
                'Company Tables': {
                    icon: <FaBuilding className="h-5 w-5 shrink-0 text-white" />,
                    subcategories: {
                        'Products': { files: [] },
                        'Customers': { files: [] },
                    }
                },
                'Parameters': {
                    icon: <FaChartLine className="h-5 w-5 shrink-0 text-white" />,
                    subcategories: {
                        'Pricing Parameters': { files: [] },
                        'Tax Rates': { files: [] },
                        'Other Parameters': { files: [] }
                    }
                },
                'Transactions': {
                    icon: <FaExchangeAlt className="h-5 w-5 shrink-0 text-white" />,
                    subcategories: {
                        'Historical Transactions': { files: [] },
                        'Other Transactions': { files: [] }
                    }
                },
                'Other Tables': {
                    icon: <IconFolder className="h-5 w-5 shrink-0 text-white" />,
                    subcategories: {
                        'Uncategorized': { files: [] }
                    }
                },
                'Price Lists': {
                    icon: <IconCurrencyDollar className="h-5 w-5 shrink-0 text-white" />,
                    files: []
                }
            };

            // Add custom subcategories to organizedData
            customSubs.forEach(sub => {
                const category = sub.category;
                const subcategory = sub.subcategory;

                if (organizedData[category]) {
                    // Initialize subcategories if needed
                    if (!organizedData[category].subcategories) {
                        organizedData[category].subcategories = {};
                    }

                    // Add custom subcategory if it doesn't exist
                    if (!organizedData[category].subcategories[subcategory]) {
                        organizedData[category].subcategories[subcategory] = { files: [] };
                    }
                }
            });

            console.log('After adding custom subs:', JSON.stringify(organizedData, null, 2));

            // Process files
            files.forEach(file => {
                const category = file.category || 'Other Tables';
                const subcategory = file.subcategory || 'Uncategorized';

                if (file.category === 'Price Lists') {
                    organizedData['Price Lists'].files.push({
                        id: file.id,
                        filename: file.filename,
                        readOnly: file.readOnly || false
                    });
                } else {
                    // Ensure category exists
                    if (!organizedData[category]) {
                        organizedData[category] = {
                            icon: <IconFolder className="h-5 w-5 shrink-0 text-white" />,
                            subcategories: {}
                        };
                    }

                    // Ensure subcategory exists
                    if (!organizedData[category].subcategories[subcategory]) {
                        organizedData[category].subcategories[subcategory] = { files: [] };
                    }

                    // Add file to subcategory
                    organizedData[category].subcategories[subcategory].files.push({
                        id: file.id,
                        filename: file.filename,
                        readOnly: file.readOnly || false
                    });
                }
            });

            console.log('Final organized data:', JSON.stringify(organizedData, null, 2));
            setSidebarData(organizedData);
        } catch (err) {
            console.error('Error fetching sidebar data:', err);
        } finally {
            setLoading(false);
        }
    };


    const toggleCategory = (category) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    };

    const handleFileSelect = (fileId, category, subcategory) => {
        setSelectedFile(fileId);
        const params = new URLSearchParams(searchParams);
        params.set('file', fileId);
        params.set('category', category);
        params.set('subcategory', subcategory);
        router.replace(`${pathname}?${params.toString()}`);
    };

    const handleCreatePriceList = () => {
        router.push('/app-pages/createOrUpload?purpose=price-list');
    };

    const links = [
        {
            label: "Dashboard",
            href: "/app-pages/dashboard",
            icon: <IconBrandTabler className="h-5 w-5 shrink-0 text-white" />,
        },
        {
            label: "Create or Upload File",
            href: "/app-pages/createOrUpload",
            icon: <FaFileUpload className="h-5 w-5 shrink-0 text-white" />,
        }
    ];
    const createSubcategory = async () => {
        try {
            const res = await fetch('/api/subcategories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: newSubcategoryModal.category,
                    subcategory: newSubcategoryName
                })
            });

            if (res.ok) {
                // Refresh sidebar data
                fetchSidebarData();
                setNewSubcategoryModal({ open: false, category: '' });
                setNewSubcategoryName('');
            }
        } catch (err) {
            console.error('Error creating subcategory:', err);
        }
    };

    return (
        <div
            className={cn(
                "mx-auto flex w-screen flex-1 flex-col overflow-hidden rounded-md border border-neutral-200 bg-gray-100 md:flex-row",
                "h-screen",
            )}
        >
            <Sidebar open={open} setOpen={setOpen}>
                <SidebarBody className="justify-between gap-10">
                    <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
                        <div className="mt-8 flex flex-col gap-2">
                            {links.map((link, idx) => (
                                <SidebarLink key={idx} link={link} />
                            ))}

                            {loading ? (
                                <div className="flex justify-center py-4">
                                    <Hourglass size="20" bgOpacity="0.1" speed="1.75" color="white" />
                                </div>
                            ) : (
                                Object.entries(sidebarData).map(([category, categoryData]) => (
                                    <div key={category} className="flex flex-col">
                                        <button
                                            className="flex items-center gap-2 py-2 text-white hover:bg-neutral-700 rounded"
                                            onClick={() => toggleCategory(category)}
                                        >
                                            {categoryData.icon}
                                            <motion.span
                                                animate={{
                                                    display: open ? "inline-block" : "none",
                                                    opacity: open ? 1 : 0,
                                                }}
                                                className="text-white text-sm"
                                            >
                                                {category}
                                            </motion.span>
                                            <motion.span
                                                className="ml-auto"
                                                animate={{
                                                    display: open ? "inline-block" : "none",
                                                    opacity: open ? 1 : 0,
                                                }}
                                            >
                                                {expandedCategories[category] ? '▼' : '►'}
                                            </motion.span>
                                        </button>

                                        {expandedCategories[category] && (
                                            <div className="pl-6">
                                                {category === 'Price Lists' && (
                                                    <button
                                                        onClick={handleCreatePriceList}
                                                        className="flex items-center gap-1 text-xs text-white mb-2"
                                                    >
                                                        <IconPlus size={12} /> Create Price List
                                                    </button>
                                                )}
                                                {category === 'Price Lists' ? (
                                                    categoryData.files.map(file => (
                                                        <button
                                                            key={file.id}
                                                            onClick={() => handleFileSelect(file.id, category, '')}
                                                            className={cn(
                                                                "block py-1 text-white text-xs truncate hover:underline w-full text-left",
                                                                selectedFile === file.id && "bg-blue-500 rounded px-2"
                                                            )}
                                                            title={file.filename}
                                                        >
                                                            <motion.span
                                                                animate={{
                                                                    display: open ? "inline-block" : "none",
                                                                    opacity: open ? 1 : 0,
                                                                }}
                                                            >
                                                                {file.filename}
                                                                {file.readOnly && " (RO)"}
                                                            </motion.span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <>
                                                        {/* ADDED: Create Subcategory Button */}
                                                        <button
                                                            onClick={() => setNewSubcategoryModal({ open: true, category })}
                                                            className="flex items-center gap-1 text-xs text-white mb-2"
                                                        >
                                                            <IconPlus size={12} /> Create Subcategory
                                                        </button>

                                                        {Object.entries(categoryData.subcategories).map(([subcategory, subData]) => (
                                                            <div key={subcategory} className="mt-1">
                                                                <div className="flex items-center py-1 text-white">
                                                                    <IconFile className="h-4 w-4 mr-2" />
                                                                    <motion.span
                                                                        animate={{
                                                                            display: open ? "inline-block" : "none",
                                                                            opacity: open ? 1 : 0,
                                                                        }}
                                                                        className="text-xs"
                                                                    >
                                                                        {subcategory}
                                                                    </motion.span>
                                                                </div>
                                                                <div className="pl-6">
                                                                    {subData.files.map(file => (
                                                                        <button
                                                                            key={file.id}
                                                                            onClick={() => handleFileSelect(file.id, category, subcategory)}
                                                                            className={cn(
                                                                                "block py-1 text-white text-xs truncate hover:underline w-full text-left",
                                                                                selectedFile === file.id && "bg-blue-500 rounded px-2"
                                                                            )}
                                                                            title={file.filename}
                                                                        >
                                                                            <motion.span
                                                                                animate={{
                                                                                    display: open ? "inline-block" : "none",
                                                                                    opacity: open ? 1 : 0,
                                                                                }}
                                                                            >
                                                                                {file.filename}
                                                                                {file.readOnly && " (RO)"}
                                                                            </motion.span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                            <div className="flex items-center gap-2 py-2 cursor-pointer text-white hover:bg-neutral-700 rounded">
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
            <Dashboard selectedFileId={selectedFile} />
            <Modal
                isOpen={newSubcategoryModal.open}
                onClose={() => setNewSubcategoryModal({ open: false, category: '' })}
                title={
                    <span className="text-indigo-900 font-semibold">
                        Create Subcategory in {newSubcategoryModal.category}
                    </span>
                }
            >
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subcategory Name
                    </label>
                    <input
                        type="text"
                        value={newSubcategoryName}
                        onChange={(e) => setNewSubcategoryName(e.target.value)}
                        placeholder="Enter subcategory name"
                        className="w-full p-2 border rounded-md text-indigo-900"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setNewSubcategoryModal({ open: false, category: '' })}
                        className="px-4 py-2 bg-gray-500 rounded-md"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={createSubcategory}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md"
                    >
                        Create
                    </button>
                </div>
            </Modal>

        </div>
    );
}

// Create inner component for Dashboard that uses useSearchParams
function DashboardContent({ selectedFileId: propSelectedFileId }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

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
    const [showTransformModal, setShowTransformModal] = useState(false);
    const [transformPrompt, setTransformPrompt] = useState('');
    const [showAddColumnModal, setShowAddColumnModal] = useState(false);
    const [newColumnName, setNewColumnName] = useState('');
    const [columnToRemove, setColumnToRemove] = useState(null);
    const [isReadOnly, setIsReadOnly] = useState(false);

    const sanitizeColumnName = (name) => {
        return (name || '').toString().replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed';
    };

    useEffect(() => {
        setIsClient(true);
        fetch('/api/files')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch files');
                return res.json();
            })
            .then(files => {
                setFiles(files);
                if (propSelectedFileId && files.some(f => f.id === propSelectedFileId)) {
                    setSelectedFileId(propSelectedFileId);
                    const selectedFile = files.find(f => f.id === propSelectedFileId);
                    setIsReadOnly(selectedFile?.readOnly || false);
                } else if (files.length > 0) {
                    setSelectedFileId(files[0].id);
                    setIsReadOnly(files[0]?.readOnly || false);
                }
                setError('');
            })
            .catch(err => {
                setError('Error fetching files. Please try again.');
                console.error('Error fetching files:', err);
            })
            .finally(() => setIsLoading(false));
    }, [propSelectedFileId]);

    useEffect(() => {
        const fetchFileData = async () => {
            if (!selectedFileId) return;

            setIsLoading(true);
            try {
                const res = await fetch(`/api/files?id=${selectedFileId}`);
                if (!res.ok) throw new Error('Failed to fetch file data');
                const { sheetName, columns, data, analysis, isReadOnly: roFlag } = await res.json();

                setSheetName(sheetName || 'Sheets');
                setColumns((columns || []).map(sanitizeColumnName));
                setData(data || []);
                setAnalysis(analysis || '');
                setIsReadOnly(roFlag);

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

    useEffect(() => {
        if (selectedFileId) {
            const params = new URLSearchParams(searchParams);
            params.set('file', selectedFileId);
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [selectedFileId, pathname, router, searchParams]);

    useEffect(() => {
        if (selectedFileId && files.length > 0) {
            const selectedFile = files.find(file => file.id === selectedFileId);
            setIsReadOnly(selectedFile?.readOnly || false);
        }
    }, [selectedFileId, files]);

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
        if (isReadOnly) {
            setError('Cannot save changes to a read-only file');
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

    const handleTransformData = async () => {
        if (!selectedFileId) {
            setAnalysisError('No file selected');
            return;
        }

        setIsAnalysisLoading(true);
        setAnalysisError('');

        try {
            const response = await fetch(`/api/transform?fileId=${selectedFileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: transformPrompt }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Transformation failed');

            setColumns(result.columns);
            setData(result.data);

            setAnalysis('Data transformation completed successfully!');
            setShowTransformModal(false);
        } catch (err) {
            setAnalysisError(err.message);
        } finally {
            setIsAnalysisLoading(false);
        }
    };

    const handleAddColumn = () => {
        if (!newColumnName.trim()) {
            setError('Column name cannot be empty');
            return;
        }

        const sanitized = sanitizeColumnName(newColumnName);
        if (columns.includes(sanitized)) {
            setError(`Column "${sanitized}" already exists`);
            return;
        }

        const newData = data.map(row => ({
            ...row,
            [sanitized]: ''
        }));

        setColumns([...columns, sanitized]);
        setData(newData);
        setShowAddColumnModal(false);
        setNewColumnName('');
        setError('');
    };

    const handleRemoveColumn = (columnName) => {
        if (columns.length <= 1) {
            setError('Cannot remove the last column');
            return;
        }

        const newData = data.map(row => {
            const newRow = { ...row };
            delete newRow[columnName];
            return newRow;
        });

        setColumns(columns.filter(col => col !== columnName));
        setData(newData);
        setColumnToRemove(null);
    };

    return (
        <div className="flex flex-1">
            <div className="flex w-full flex-1 flex-col gap-2 rounded-tl-2xl border border-neutral-200 bg-gray-200 p-2 md:p-10">
                <div className="flex justify-between items-center mt-2 px-4">
                    <div className="text-xl font-bold text-center w-full dark:text-indigo-900">{sheetName}
                        {isReadOnly && (
                            <span className="px-2 py-2 bg-yellow-500 text-white text-xs rounded-md ml-10">
                                Read-Only
                            </span>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleCustomAnalyze}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        >
                            Custom Analyze
                        </button>

                        <button
                            onClick={() => setShowTransformModal(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Create Changes in Data through AI
                        </button>

                        <button
                            onClick={handleSaveChanges}
                            disabled={isLoading || isReadOnly}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>

                {showCustomPromptModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
                            <h3 className="text-lg font-semibold mb-4 dark:text-black">Custom Analysis Prompt</h3>
                            <textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder="Enter your custom analysis instructions..."
                                className="w-full h-40 p-3 border rounded-lg mb-4 dark:border-black dark:text-black"
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowCustomPromptModal(false)}
                                    className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black"
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

                {showTransformModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
                            <h3 className="text-lg font-semibold mb-4 dark:text-black">
                                Transform Data with AI
                            </h3>
                            <textarea
                                value={transformPrompt}
                                onChange={(e) => setTransformPrompt(e.target.value)}
                                placeholder="Enter instructions to transform the data (e.g., 'Add a new row ')..."
                                className="w-full h-40 p-3 border rounded-lg mb-4 dark:border-black dark:text-black"
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowTransformModal(false)}
                                    className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleTransformData}
                                    disabled={isAnalysisLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                                >
                                    {isAnalysisLoading ? 'Transforming...' : 'Transform Data'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showAddColumnModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-md">
                            <h3 className="text-lg font-semibold mb-4 dark:text-black">Add New Column</h3>
                            <input
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                placeholder="Enter column name"
                                className="w-full p-3 border rounded-lg mb-4 dark:border-black dark:text-black"
                            />
                            {error && <div className="text-red-500 mb-2">{error}</div>}
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowAddColumnModal(false)}
                                    className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddColumn}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                                >
                                    Add Column
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {columnToRemove && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-md">
                            <h3 className="text-lg font-semibold mb-4 dark:text-black">
                                Confirm Column Removal
                            </h3>
                            <p className="mb-4">
                                Are you sure you want to remove the column: <strong>{columnToRemove}</strong>?
                                This action cannot be undone.
                            </p>
                            {error && <div className="text-red-500 mb-2">{error}</div>}
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setColumnToRemove(null)}
                                    className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleRemoveColumn(columnToRemove)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg"
                                >
                                    Remove Column
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {analysis && (
                    <div className="mt-4 max-h-[40vh] overflow-y-auto bg-white p-4 rounded-lg shadow-md relative z-10">
                        <h3 className="text-lg font-semibold mb-2 text-indigo-900">PriceSmurf AI</h3>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-indigo-900">Select File</label>
                        <select
                            value={selectedFileId || ''}
                            onChange={(e) => {
                                setSelectedFileId(e.target.value);
                                const selectedFile = files.find(f => f.id === e.target.value);
                                setIsReadOnly(selectedFile?.readOnly || false);
                            }}
                            className="w-full border rounded-lg p-2 dark:bg-indigo-900"
                            disabled={isLoading}
                        >
                            <option value="">Select a file</option>
                            {files.map(file => (
                                <option key={file.id} value={file.id}>
                                    {file.filename}
                                    {file.readOnly && " (Read-Only)"}
                                    {file.category && ` [${file.category} > ${file.subcategory}]`}
                                </option>
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
                        <div className="relative overflow-x-auto shadow-md sm:rounded-lg block max-h-[70vh] overflow-y-auto">
                            <table className="min-w-full text-sm text-left text-gray-500">
                                <thead className="sticky top-0 text-xs text-gray-700 uppercase bg-gray-50 z-10">
                                    <tr>
                                        {columns.map((header) => (
                                            <th key={header} className="px-6 py-3 group relative">
                                                {header}
                                                {!isReadOnly && (
                                                    <button
                                                        onClick={() => setColumnToRemove(header)}
                                                        className="absolute right-1 top-1/2 transform -translate-y-1/2 text-white opacity-0 group-hover:opacity-100 p-2 bg-red-200 rounded-full"
                                                        title={`Remove ${header} column`}
                                                    >
                                                        ❌
                                                    </button>
                                                )}
                                            </th>
                                        ))}
                                        <th className="px-6 py-3 flex items-center gap-2">
                                            <span>Action</span>
                                            <button
                                                onClick={() => setShowAddColumnModal(true)}
                                                className="text-white hover:text-green-200 bg-indigo-200 p-2 rounded-full"
                                                title="Add new column"
                                            >
                                                ➕
                                            </button>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((row, index) => (
                                        <tr key={index} className="bg-white border-b hover:bg-gray-50 dark:hover:bg-gray-200">
                                            {columns.map((col) => (
                                                <td key={col} className="px-6 py-4">{row[col] || ''}</td>
                                            ))}
                                            <td className="px-6 py-4 space-x-3">
                                                {!isReadOnly && (
                                                    <>
                                                        <button onClick={() => handleEdit(index)} className="font-medium text-blue-600 hover:underline">Edit</button>
                                                        <button onClick={() => handleRemove(index)} className="font-medium text-red-600 hover:underline">Remove</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {editingIndex !== null && !isReadOnly && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto">
                        <div className="bg-white p-5 rounded-lg shadow-lg w-full max-w-md overflow-y-auto">
                            <h3 className="text-lg font-semibold mb-4 dark:text-black">Edit Details</h3>
                            {columns.map((key) => (
                                <div key={key} className="mb-3">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-black mb-1">{key}</label>
                                    <input
                                        type="text"
                                        name={key}
                                        value={editData[key] || ''}
                                        onChange={handleChange}
                                        className="w-full border rounded-lg p-2 dark:text-black"
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end space-x-2">
                                <button onClick={() => setEditingIndex(null)} className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black">Cancel</button>
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
}

// Wrap DashboardContent with Suspense
function Dashboard({ selectedFileId }) {
    return (
        <Suspense fallback={
            <div className="flex justify-center items-center h-full">
                <Hourglass size="30" color="#312e81" />
            </div>
        }>
            <DashboardContent selectedFileId={selectedFileId} />
        </Suspense>
    );
}

// Wrap SidebarContent with Suspense
export default function SidebarDemo() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Hourglass size="50" color="#312e81" />
            </div>
        }>
            <SidebarContent />
        </Suspense>
    );
}