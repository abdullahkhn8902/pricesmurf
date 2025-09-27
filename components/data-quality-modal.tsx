"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { LoaderSequence } from "@/components/loader-sequence"
import { ResultsView } from "@/components/results-view"
import { AlertCircle, FileSpreadsheet } from "lucide-react"

interface DataQualityModalProps {
  isOpen: boolean
  onClose: () => void
}

type ModalState = "file-selection" | "validation-error" | "loading" | "results"

interface ValidationError {
  missing_columns: string[]
  message: string
}

export function DataQualityModal({ isOpen, onClose }: DataQualityModalProps) {
  const [selectedFile, setSelectedFile] = useState<string>("")
  const [modalState, setModalState] = useState<ModalState>("file-selection")
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const [results, setResults] = useState<any>(null)
  const [files, setFiles] = useState<Array<{ id: string; name: string; type?: string; readOnly?: boolean }>>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [serverRunId, setServerRunId] = useState<string | null>(null)
  const router = useRouter()

  const mockFiles = [
    { id: "data.csv", name: "data.csv", type: "CSV" },
    { id: "transactions_sample.xlsx", name: "transactions_sample.xlsx", type: "XLSX" },
  ]

  const isRealSelection = !!files.find((f) => String(f.id) === String(selectedFile))

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const controller = new AbortController()

    async function loadFiles() {
      setIsLoadingFiles(true)
      setFilesError(null)
      try {
        const res = await fetch("/api/files", { signal: controller.signal })
        if (!res.ok) throw new Error(`Failed to fetch files (${res.status})`)
        const json = await res.json()
        const normalized = (Array.isArray(json) ? json : []).map((f: any) => ({
          id: String(f.id ?? f.fileId ?? f._id ?? f.filename ?? f.name ?? ""),
          name: String(f.filename ?? f.name ?? f.id ?? f.fileId ?? ""),
          type:
            f.type ??
            (/\.(xlsx|xls)/i.test(String(f.filename ?? f.name ?? "")) ? "XLSX" : "CSV"),
          readOnly: !!f.readOnly,
        })).filter((f: any) => f.id)

        if (!cancelled) {
          if (normalized.length > 0) {
            setFiles(normalized)
            if (!selectedFile || !normalized.find((f) => f.id === selectedFile)) {
              setSelectedFile(normalized[0].id)
            }
          } else {
            setFiles(mockFiles)
            if (!selectedFile && mockFiles.length > 0) setSelectedFile(mockFiles[0].id)
            setFilesError("No files returned from server (using fallback).")
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return
        console.error("Error loading files:", err)
        if (!cancelled) {
          setFiles(mockFiles)
          if (!selectedFile && mockFiles.length > 0) setSelectedFile(mockFiles[0].id)
          setFilesError(String(err?.message ?? "Failed to load files"))
        }
      } finally {
        if (!cancelled) setIsLoadingFiles(false)
      }
    }

    loadFiles()
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Create server run, validate file, then start loader
  const handleRunAgent = async () => {
    if (!selectedFile) return
    if (!isRealSelection) {
      setValidationError({ missing_columns: [], message: "Please select a valid file." })
      setModalState("validation-error")
      return
    }

    setIsValidating(true)
    setValidationError(null)

    try {
      // 1) fetch file preview from /api/files
      const fileDetailsRes = await fetch(`/api/files?id=${encodeURIComponent(selectedFile)}`)
      if (!fileDetailsRes.ok) {
        throw new Error(`Failed to fetch file details: ${fileDetailsRes.status}`)
      }
      const fileDetails = await fileDetailsRes.json()

      if (!Array.isArray(fileDetails.columns) || !Array.isArray(fileDetails.data)) {
        throw new Error("File preview missing columns/data")
      }

      // 2) validate (send inline preview to /api/validate)
      const validateRes = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns: fileDetails.columns,
          data: fileDetails.data,
          preview: true,
          fileId: selectedFile
        }),
      })

      const validateJson = await validateRes.json().catch(() => ({}))
      if (!validateRes.ok || !validateJson.validation_passed) {
        setValidationError({
          missing_columns: validateJson?.missing_columns ?? [],
          message: validateJson?.message ?? `Validation failed (${validateRes.status})`
        })
        setModalState("validation-error")
        return
      }

      // 3) create server-run BEFORE launching loader
      const createRunRes = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: selectedFile }),
      })
      if (!createRunRes.ok) {
        const txt = await createRunRes.text().catch(() => "")
        throw new Error(`Failed to create run on server: ${createRunRes.status} ${txt}`)
      }
      const createJson = await createRunRes.json()
      const runId = createJson?.runId
      if (!runId) throw new Error("Server did not return runId")

      setServerRunId(runId)
      setModalState("loading")
      // LoaderSequence (rendered) will pick the runId prop and start work
    } catch (err: any) {
      console.error("Validation / run creation failed:", err)
      setValidationError({
        missing_columns: [],
        message: `Failed to validate/create run: ${String(err?.message ?? err)}`
      })
      setModalState("validation-error")
    } finally {
      setIsValidating(false)
    }
  }

  // called when loader sequence completes (finalResults is the aggregated UI-shaped object)
  const handleLoadingComplete = async (finalResults: any, runId?: string) => {
    const useRunId = runId || serverRunId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    try {
      // persist locally for instant client rendering
      localStorage.setItem(`results_${useRunId}`, JSON.stringify(finalResults))

      // also persist final results to server (safe idempotent upsert)
      await fetch("/api/report/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: useRunId, analysis: finalResults }),
      }).catch((e) => {
        console.warn("Failed to save final results to server (non-fatal):", e)
      })

      // close modal and navigate to results page
      handleClose()
      router.push(`/results/${useRunId}`)
    } catch (e: any) {
      console.error("handleLoadingComplete error:", e)
      handleClose()
      router.push(`/results/${useRunId}`)
    }
  }

  const handleLoadingError = (error: string) => {
    setValidationError({ missing_columns: [], message: error })
    setModalState("validation-error")
  }

  const resetModal = () => {
    setSelectedFile("")
    setModalState("file-selection")
    setValidationError(null)
    setResults(null)
    setFilesError(null)
    setServerRunId(null)
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">DATA QUALITY AGENT</DialogTitle>
        </DialogHeader>

        {modalState === "file-selection" && (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select File</label>
              <Select value={selectedFile} onValueChange={setSelectedFile}>
                <SelectTrigger className="w-full" disabled={isLoadingFiles}>
                  <SelectValue placeholder={isLoadingFiles ? "Loading files..." : "Choose a file to analyze..."} />
                </SelectTrigger>

                <SelectContent>
                  {isLoadingFiles && (
                    <SelectItem key="loading" value="__loading__" disabled>
                      Loading...
                    </SelectItem>
                  )}

                  {filesError && !isLoadingFiles && (
                    <SelectItem key="error" value="__error__" disabled>
                      Error loading files
                    </SelectItem>
                  )}

                  {!isLoadingFiles && files.length === 0 && (
                    <SelectItem key="no-files" value="__none__" disabled>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>No files found</span>
                      </div>
                    </SelectItem>
                  )}

                  {!isLoadingFiles &&
                    (files.length ? files : mockFiles).map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4" />
                          <span>{file.name}</span>
                          <Badge variant="outline" className="ml-auto">
                            {file.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {filesError && <div className="text-sm text-red-600 mt-1">{filesError}</div>}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleRunAgent}
                disabled={!selectedFile || isValidating || !isRealSelection}
                className="flex-1"
              >
                {isValidating ? "Validating..." : "Run Agent"}
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {modalState === "validation-error" && validationError && (
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError.message}</AlertDescription>
            </Alert>

            {validationError.missing_columns.length > 0 && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">Missing Required Columns:</p>
                <div className="flex flex-wrap gap-2">
                  {validationError.missing_columns.map((col) => (
                    <Badge key={col} variant="destructive">
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={() => setModalState("file-selection")}>Try Again</Button>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {modalState === "loading" && (
          <LoaderSequence
            fileId={selectedFile}
            runId={serverRunId ?? undefined}
            onComplete={handleLoadingComplete}
            onError={handleLoadingError}
          />
        )}

        {modalState === "results" && results && (
          <ResultsView results={results} fileName={selectedFile} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
