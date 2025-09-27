"use client";
import { useState, useEffect, useRef, Suspense } from 'react'
import { Sidebar, SidebarBody, SidebarLink } from "@/component-app/ui/sidebar";
import Modal from "@/component-app/ui/Modal";
import { IconPencil } from "@tabler/icons-react";
import { IconFolderFilled } from "@tabler/icons-react";
import { IconMaximize, IconMinimize } from "@tabler/icons-react";

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
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { IconFileOff } from "@tabler/icons-react";

// Create inner component for Sidebar that uses useSearchParams
function SidebarContent() {
  const [newSubcategoryModal, setNewSubcategoryModal] = useState({ open: false, category: '' });
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [expandedSubcategories, setExpandedSubcategories] = useState({});
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

  }, [open]);
  useEffect(() => {
    const fileId = searchParams.get('file');
    if (fileId) {
      setSelectedFile(fileId);
    }
  }, [searchParams]);
  const toggleSubcategory = (category, subcategory) => {
    setExpandedSubcategories(prev => ({
      ...prev,
      [`${category}-${subcategory}`]: !prev[`${category}-${subcategory}`]
    }));
  };

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
          icon: <FaBuilding className="h-5 w-5 shrink-0 text-white " />,
          subcategories: {
            'Products': { files: [] },
            'Customers': { files: [] },
          }
        },
        'Parameters': {
          icon: <FaChartLine className="h-5 w-5 shrink-0 text-white " />,
          subcategories: {
            'Pricing Parameters': { files: [] },
            'Tax Rates': { files: [] },
            'Other Parameters': { files: [] }
          }
        },
        'Transactions': {
          icon: <FaExchangeAlt className="h-5 w-5 shrink-0 text-white " />,
          subcategories: {
            'Historical Transactions': { files: [] },
            'Other Transactions': { files: [] }
          }
        },
        'Other Tables': {
          icon: <IconFolder className="h-5 w-5 shrink-0 text-white " />,
          subcategories: {
            'Uncategorized': { files: [] }
          }
        },
        'Price Lists': {
          icon: <IconCurrencyDollar className="h-5 w-5 shrink-0 text-white " />,
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

        // Create consistent file data object
        const fileData = {
          id: file.id,
          filename: file.filename,
          readOnly: file.readOnly || false
        };

        if (file.category === 'Price Lists') {
          organizedData['Price Lists'].files.push(fileData);
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
          organizedData[category].subcategories[subcategory].files.push(fileData);
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
        "mx-auto flex w-screen flex-1 flex-col min-h-0 rounded-md border border-neutral-200 bg-gray-200 md:flex-row",
        "min-h-screen",
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
                  <div key={category} className="flex flex-col ">
                    <button
                      className="flex items-center gap-2 py-2 text-blue-200  rounded"
                      onClick={() => toggleCategory(category)}
                    >
                      {categoryData.icon}
                      <motion.span
                        animate={{
                          display: open ? "inline-block" : "none",
                          opacity: open ? 1 : 0,
                        }}
                        className="text-white text-md "
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
                        {expandedCategories[category] ? (
                          <IconChevronDown className="h-4 w-4" />
                        ) : (
                          <IconChevronRight className="h-4 w-4" />
                        )}
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
                                <button
                                  className="flex items-center w-full py-1 text-white hover:bg-neutral-700 rounded group"
                                  onClick={() => toggleSubcategory(category, subcategory)}
                                >
                                  <IconFolderFilled className="h-4 w-4 mr-2 text-yellow-400" />
                                  <motion.span
                                    animate={{
                                      display: open ? "inline-block" : "none",
                                      opacity: open ? 1 : 0,
                                    }}
                                    className="text-xs flex-1 text-left"
                                  >
                                    {subcategory}
                                  </motion.span>
                                  <motion.span
                                    className="ml-auto transition-transform duration-200 group-hover:scale-110"
                                    animate={{
                                      display: open ? "inline-block" : "none",
                                      opacity: open ? 1 : 0,
                                    }}
                                  >
                                    {expandedCategories[category] ? (
                                      <IconChevronDown className="h-4 w-4 text-blue-300" />
                                    ) : (
                                      <IconChevronRight className="h-4 w-4 text-blue-300" />
                                    )}
                                  </motion.span>
                                </button>

                                {expandedSubcategories[`${category}-${subcategory}`] && (
                                  <div className="pl-6 border-l-2 border-blue-400 ml-2 my-1">
                                    {subData.files.length > 0 ? (
                                      subData.files.map(file => (
                                        <button
                                          key={file.id}
                                          onClick={() => handleFileSelect(file.id, category, subcategory)}
                                          className={cn(
                                            "flex items-center py-1 text-white text-xs w-full text-left hover:underline",
                                            selectedFile === file.id && "bg-blue-500 rounded px-2"
                                          )}
                                          title={file.filename}
                                        >
                                          <IconFile className="h-3 w-3 mr-2 text-gray-300" />
                                          <motion.span
                                            className="truncate"
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
                                      <div className="flex items-center py-1 text-gray-400 italic text-xs">
                                        <IconFileOff className="h-3 w-3 mr-2" />
                                        <motion.span
                                          animate={{
                                            display: open ? "inline-block" : "none",
                                            opacity: open ? 1 : 0,
                                          }}
                                        >
                                          No tables
                                        </motion.span>
                                      </div>
                                    )}
                                  </div>
                                )}

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
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [newRowData, setNewRowData] = useState({});
  const [columnDefaultValue, setColumnDefaultValue] = useState('');
  const [newColumnRowValues, setNewColumnRowValues] = useState({});

  // Category UI states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryOptions] = useState([
    "Company Tables",
    "Parameters",
    "Transactions",
    "Other Tables",
    "Price Lists"
  ]);
  const BASE_SUBCATS = {
    "Company Tables": ["Products", "Customers"],
    "Parameters": ["Pricing Parameters", "Tax Rates"],
    "Transactions": ["Historical Transactions"],
    "Other Tables": ["Uncategorized"],
    "Price Lists": ["General"]
  };
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  // Get the current selected file
  const selectedFile = files.find(file => file.id === selectedFileId);
  const fileName = selectedFile ? selectedFile.filename : sheetName;

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
    let isMounted = true;
    const fetchFileData = async () => {
      if (!selectedFileId) return;

      setIsLoading(true);
      try {
        const res = await fetch(`/api/files?id=${selectedFileId}`);
        if (!res.ok) throw new Error('Failed to fetch file data');
        const { sheetName, columns, data, analysis, isReadOnly: roFlag } = await res.json();

        if (isMounted) {
          setSheetName(sheetName || 'Sheets');
          setColumns((columns || []).map(sanitizeColumnName));
          setData(data || []);
          setAnalysis(analysis || '');
          setIsReadOnly(roFlag);
        }

        setError('');
      } catch (err) {
        setError('Error fetching file data. Please try again.');
        console.error('Error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchFileData();
    return () => { isMounted = false };
  }, [selectedFileId]);


  useEffect(() => {
    if (selectedFileId && files.length > 0) {
      const selectedFile = files.find(file => file.id === selectedFileId);
      setIsReadOnly(selectedFile?.readOnly || false);
    }
  }, [selectedFileId, files]);

  // When category changes, load subcategories (try /api/subcategories then fallback)
  useEffect(() => {
    if (!selectedCategory) {
      setAvailableSubcategories([]);
      setSelectedSubcategory('');
      return;
    }

    let cancelled = false;
    async function loadSubs() {
      setCategoryLoading(true);
      setCategoryError('');
      try {
        const res = await fetch('/api/subcategories');
        if (res.ok) {
          const subs = await res.json(); // expected array of {category, subcategory}
          const filtered = subs.filter(s => s.category === selectedCategory).map(s => s.subcategory);
          if (!cancelled && filtered.length > 0) {
            setAvailableSubcategories(filtered);
            setSelectedSubcategory(filtered[0] || '');
            return;
          }
        }
      } catch (e) {
        console.error('Failed to fetch custom subcategories', e);
      }

      // fallback
      const fallback = BASE_SUBCATS[selectedCategory] || [];
      if (!cancelled) {
        setAvailableSubcategories(fallback);
        setSelectedSubcategory(fallback[0] || '');
      }
      setCategoryLoading(false);
    }
    loadSubs();
    return () => { cancelled = true; };
  }, [selectedCategory]);

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

    // Create new column with values for each row
    const newData = data.map((row, index) => ({
      ...row,
      [sanitized]: newColumnRowValues[index] || ''
    }));

    setColumns([...columns, sanitized]);
    setData(newData);
    setShowAddColumnModal(false);
    setNewColumnName('');
    setNewColumnRowValues({}); // Reset row values
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

  const handleSaveFileName = async () => {
    if (!selectedFileId) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/update-filename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedFileId,
          newFilename: newFileName
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Update the files state with the new filename
        setFiles(prevFiles =>
          prevFiles.map(file =>
            file.id === selectedFileId
              ? { ...file, filename: result.newFilename }
              : file
          )
        );
        setIsEditingFileName(false);
      } else {
        throw new Error(result.error || 'Failed to update filename');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleReadOnly = async () => {
    if (!selectedFileId) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/update-readonly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedFileId,
          readOnly: !isReadOnly
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Update local state
        setIsReadOnly(!isReadOnly);

        // Update files list
        setFiles(prevFiles =>
          prevFiles.map(file =>
            file.id === selectedFileId
              ? { ...file, readOnly: !isReadOnly }
              : file
          )
        );
      } else {
        throw new Error(result.error || 'Failed to update read-only status');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  const handleAddRow = () => {
    // Check if any value is provided
    const hasValue = Object.values(newRowData).some(val => val !== '');

    if (!hasValue) {
      setError('Please enter at least one value for the new row');
      return;
    }

    // Create new row with user-provided values
    const newRow = {};
    columns.forEach(col => {
      newRow[col] = newRowData[col] || '';
    });

    setData([...data, newRow]);
    setShowAddRowModal(false);
    setNewRowData({});
    setError('');
  };

  const handleRowInputChange = (col, value) => {
    setNewRowData(prev => ({
      ...prev,
      [col]: value
    }));
  };

  // Open category modal and prefill with current file category
  const openCategoryModal = () => {
    setCategoryError('');
    const currentFile = files.find(f => f.id === selectedFileId);
    const curCat = currentFile?.category || '';
    const curSub = currentFile?.subcategory || '';
    setSelectedCategory(curCat);
    setSelectedSubcategory(curSub);
    // availableSubcategories will be populated by effect watching selectedCategory
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!selectedFileId) {
      setCategoryError('No file selected');
      return;
    }
    if (!selectedCategory) {
      setCategoryError('Please select a category');
      return;
    }

    setCategoryLoading(true);
    setCategoryError('');
    try {
      const res = await fetch('/api/update-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileIds: [selectedFileId],
          category: selectedCategory,
          subcategory: selectedSubcategory || (availableSubcategories[0] || 'General')
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update category');

      // update local files state (optimistic)
      setFiles(prev => prev.map(f => f.id === selectedFileId ? {
        ...f,
        category: selectedCategory,
        subcategory: selectedSubcategory || (availableSubcategories[0] || 'General'),
        manualCategoryOverride: true
      } : f));

      // also refresh file details (optional) to reflect new category in UI
      try {
        const refreshed = await fetch(`/api/files?id=${selectedFileId}`);
        if (refreshed.ok) {
          const details = await refreshed.json();
          setSheetName(details.sheetName || sheetName);
          // keep columns/data as they are; metadata updated above
        }
      } catch (e) {
        console.warn('Could not refresh file details after category update', e);
      }

      setShowCategoryModal(false);
      setCategoryLoading(false);
    } catch (err) {
      console.error('Failed to save category:', err);
      setCategoryError(err.message || 'Failed to update category');
      setCategoryLoading(false);
    }
  };

  return (
    <div className="flex flex-1 h-full">
      <div className="flex w-full flex-1 flex-col min-h-0 gap-2 rounded-tl-2xl border border-neutral-200 bg-gray-200 p-2 md:p-10">
        {/* HEADER + ACTIONS (responsive) */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-2 px-4 gap-3">
          {/* Left: Title & inline controls */}
          <div className="flex flex-col md:flex-row items-start md:items-center w-full md:w-auto gap-3">
            <div className="flex items-center xl:ml-[9rem]">
              {isEditingFileName ? (
                <div className="flex items-center">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="text-xl font-bold text-center dark:text-indigo-900 border-b border-indigo-900 bg-transparent px-2"
                    autoFocus
                  />
                  <button onClick={handleSaveFileName} className="ml-2 px-2 py-1 bg-green-500 text-white rounded">Save</button>
                  <button onClick={() => setIsEditingFileName(false)} className="ml-1 px-2 py-1 bg-gray-500 text-white rounded">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="text-xl font-bold dark:text-indigo-900">{fileName}</div>
                  {!isReadOnly && (
                    <button
                      onClick={() => { setIsEditingFileName(true); setNewFileName(fileName); }}
                      className="ml-2 text-indigo-900 hover:text-indigo-700"
                    >
                      <IconPencil size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Toggle + label (stays with title on mobile) */}
            <div className="ml-0 md:ml-4 flex items-center gap-2">
              <label htmlFor="readOnlyToggle" className={cn(
                "relative block h-6 w-12 rounded-full transition-colors [-webkit-tap-highlight-color:_transparent]",
                isReadOnly ? "bg-yellow-500" : "bg-green-500"
              )}>
                <input type="checkbox" id="readOnlyToggle" className="peer sr-only" checked={!isReadOnly} onChange={handleToggleReadOnly} disabled={isLoading} />
                <span className={cn("absolute inset-y-0 start-0 m-0.5 size-5 rounded-full bg-white transition-all duration-300", isReadOnly ? "start-0" : "start-6")}></span>
              </label>
              <span className="text-xs font-medium text-indigo-900">{isReadOnly ? "Read-Only" : "Editable"}</span>
            </div>
          </div>

          {/* Desktop Actions: hidden on mobile */}
          <div className="hidden md:flex gap-2">
            <button onClick={handleCustomAnalyze} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Custom Analyze</button>
            <button onClick={openCategoryModal} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">Change Category</button>
            <button onClick={() => setShowTransformModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Changes in Data through AI</button>
            <button onClick={handleSaveChanges} disabled={isLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50">Save Changes</button>
          </div>

          {/* Mobile Actions: visible only on small screens.
              Two compact groups so they don't overflow vertically too long.
              Sticky behavior helps them remain visible when the user scrolls the page on mobile. */}
          <div className="w-full md:hidden sticky top-0 bg-gray-200/80 dark:bg-gray-200/60 backdrop-blur-sm z-30 px-3 py-2 rounded-lg flex flex-col gap-2">
            <div className="flex gap-2 justify-between">
              <button onClick={handleCustomAnalyze} className="flex-1 px-3 py-2 text-sm rounded bg-purple-600 text-white">Custom</button>
              <button onClick={openCategoryModal} className="flex-1 px-3 py-2 text-sm rounded bg-orange-500 text-white">Category</button>
            </div>
            <div className="flex gap-2 justify-between">
              <button onClick={() => setShowTransformModal(true)} className="flex-1 px-3 py-2 text-sm rounded bg-blue-600 text-white">Transform</button>
              <button onClick={handleSaveChanges} disabled={isLoading} className="flex-1 px-3 py-2 text-sm rounded bg-green-600 text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>

        {/* Category Modal */}
        {showCategoryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 dark:text-black">Change File Category</h3>

              {categoryError && <div className="text-red-500 mb-2">{categoryError}</div>}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2  text-indigo-900"
                >
                  <option value="">(Choose category)</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                <select
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  disabled={!selectedCategory || availableSubcategories.length === 0}
                  className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2  disabled:opacity-60 text-indigo-900"
                >
                  <option value="">{selectedCategory ? "(Select subcategory)" : "(N/A)"}</option>
                  {availableSubcategories.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryError('');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCategory}
                  disabled={categoryLoading}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50"
                >
                  {categoryLoading ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {showAddRowModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-4 dark:text-black">Add New Row</h3>
              {error && <div className="text-red-500 mb-4">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 max-h-[50vh] overflow-y-auto">
                {columns.map(col => (
                  <div key={col} className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-black mb-1">
                      {col}
                    </label>
                    <input
                      type="text"
                      value={newRowData[col] || ''}
                      onChange={(e) => handleRowInputChange(col, e.target.value)}
                      className="w-full border rounded-lg p-2 dark:text-black"
                      placeholder={`Enter ${col}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowAddRowModal(false);
                    setNewRowData({});
                    setError('');
                  }}
                  className="px-4 py-2 bg-gray-300 rounded-lg dark:text-black"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRow}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  Add Row
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddColumnModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-4 dark:text-black">Add New Column</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-black">
                  Column Name
                </label>
                <input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Enter column name"
                  className="w-full p-3 border rounded-lg mb-4 dark:border-black dark:text-black"
                />
              </div>

              <div className="max-h-[50vh] overflow-y-auto">
                <h4 className="text-md font-medium mb-3 dark:text-black">
                  Enter values for each row:
                </h4>
                {data.map((_, index) => (
                  <div key={index} className="flex items-center mb-2">
                    <span className="mr-2 w-16 dark:text-black">Row {index + 1}:</span>
                    <input
                      value={newColumnRowValues[index] || ''}
                      onChange={(e) => setNewColumnRowValues(prev => ({
                        ...prev,
                        [index]: e.target.value
                      }))}
                      className="flex-1 p-2 border rounded dark:border-black dark:text-black"
                      placeholder={`Value for row ${index + 1}`}
                    />
                  </div>
                ))}
              </div>

              {error && <div className="text-red-500 mb-2">{error}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setShowAddColumnModal(false);
                    setNewColumnName('');
                    setNewColumnRowValues({});
                    setError('');
                  }}
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
              <p className="mb-4 text-indigo-900">
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
          <div className="mt-4 w-full bg-white p-6 rounded-lg shadow-lg relative z-10">
            <h3 className="text-xl font-semibold mb-4 text-indigo-900">PriceSmurf AI</h3>
            <div className="whitespace-pre-line text-gray-700 text-base leading-relaxed max-h-[200px] overflow-y-auto">
              {analysis}
            </div>
            <button
              onClick={() => setAnalysis('')}
              className="mt-4 text-red-600 hover:text-red-700 font-medium"
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
              className="w-full border rounded-lg p-2 bg-white shadow-md"
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
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg px-4 max-w-full bg-white">
              <table className="min-w-full text-sm text-left text-gray-700 table-fixed ">
                <thead className="sticky top-0 text-xs text-gray-700 uppercase  z-10">
                  <tr>
                    {columns.map((header) => (
                      <th key={header} className="px-6 py-3 group relative bg-white">
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
                        onClick={() => setShowAddRowModal(true)}
                        className="text-indigo-900 hover:text-white bg-indigo-200 p-2 rounded-full"
                        title="Add new row"
                      >
                        ➕Add row
                      </button>

                      <button
                        onClick={() => setShowAddColumnModal(true)}
                        className="text-indigo-900 hover:text-white bg-indigo-200 p-2 rounded-full"
                        title="Add new column"
                      >
                        ➕Add column
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
