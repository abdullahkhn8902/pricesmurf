// app/api/files/route.js
import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import { getAuth } from "@clerk/nextjs/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { Readable } from "stream";

/**
 * Single-file route handler for /api/files
 * Exposes GET (list or preview), POST (upload), PUT (replace file contents)
 *
 * Notes:
 * - Uses GridFS bucket 'excelFiles'
 * - Stores metadata.userId for access control
 * - Returns JSON responses with appropriate status codes
 */

// read MONGODB_URI from env
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "Project0";

if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set in environment");
    // We don't throw here so the dev server can still start, but requests will fail.
}

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }
    if (!MONGODB_URI) {
        throw new Error("MONGODB_URI missing");
    }
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    cachedClient = client;
    cachedDb = db;
    return { client, db };
}

async function getGridFSBucket() {
    const { db } = await connectToDatabase();
    return new GridFSBucket(db, { bucketName: "excelFiles" });
}

function normalizeColumnName(col) {
    return (col || "").toString().replace(/[^a-zA-Z0-9\s_-]/g, "").trim() || "Unnamed";
}

function parseBufferToTable(buffer, filename = "file", contentType = "") {
    // returns { sheetName, columns, data } - data is array of objects (strings)
    let sheetName = filename.split(".")[0] || "Sheet1";
    let columns = [];
    let data = [];

    const isCSV = () => {
        if (contentType && typeof contentType === "string") {
            if (contentType.toLowerCase().includes("csv")) return true;
            if (contentType.toLowerCase().includes("excel") || contentType.toLowerCase().includes("spreadsheet"))
                return false;
        }
        if (filename && typeof filename === "string") {
            const n = filename.toLowerCase();
            if (n.endsWith(".csv")) return true;
            if (n.endsWith(".xlsx") || n.endsWith(".xls")) return false;
        }
        // fallback to treat as spreadsheet if name ends with xlsx/xls
        return /\.(csv)$/i.test(filename);
    };

    if (isCSV()) {
        const records = parse(buffer.toString("utf8"), {
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });
        const rawHeader = records[0] || [];
        const hasIndexColumn = rawHeader.length > 0 && /^\d+$/.test(String(rawHeader[0]).trim());
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;
        columns = rawColumns.map((c) => normalizeColumnName(c));
        data = records.slice(1).map((row) => {
            const processedRow = hasIndexColumn ? row.slice(1) : row;
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = processedRow[i] !== undefined && processedRow[i] !== null ? processedRow[i] : "";
            });
            return obj;
        });
    } else {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const rawHeader = jsonData[0] || [];
        const hasIndexColumn = rawHeader.length > 0 && /^\d+$/.test(String(rawHeader[0]).trim());
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader;
        columns = rawColumns.map((c) => normalizeColumnName(c));
        data = jsonData.slice(1).map((row) => {
            const processedRow = hasIndexColumn ? row.slice(1) : row;
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = processedRow[i] !== undefined && processedRow[i] !== null ? processedRow[i] : "";
            });
            return obj;
        });
        // Try to capture sheet name more accurately
        sheetName = workbook.SheetNames[0] || sheetName;
    }

    return { sheetName, columns, data };
}

/* ------------------------- GET handler ------------------------- */
export async function GET(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const url = new URL(request.url);
        const fileId = url.searchParams.get("id");
        const metadataOnly = url.searchParams.get("metadata") === "1";

        const { db } = await connectToDatabase();
        const filesCollection = db.collection("excelFiles.files");
        const bucket = new GridFSBucket(db, { bucketName: "excelFiles" });

        if (fileId) {
            if (!ObjectId.isValid(fileId)) {
                return new Response(JSON.stringify({ error: "Invalid file ID" }), { status: 400, headers: { "Content-Type": "application/json" } });
            }

            const file = await filesCollection.findOne({ _id: new ObjectId(fileId), "metadata.userId": userId });
            if (!file) {
                return new Response(JSON.stringify({ error: "File not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
            }

            // If only metadata requested, don't stream file contents
            if (metadataOnly) {
                return new Response(
                    JSON.stringify({
                        id: file._id.toString(),
                        filename: file.filename,
                        uploadDate: file.uploadDate,
                        contentType: file.contentType,
                        category: file.metadata?.category || "Other Tables",
                        subcategory: file.metadata?.subcategory || "Uncategorized",
                        readOnly: file.metadata?.isReadOnly || false,
                        isPriceList: file.metadata?.isPriceList || false,
                        size: file.length || null,
                    }),
                    { status: 200, headers: { "Content-Type": "application/json" } }
                );
            }

            // Download file from GridFS
            const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));
            const chunks = [];
            for await (const chunk of downloadStream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const { sheetName, columns, data } = parseBufferToTable(buffer, file.filename, file.contentType);

            return new Response(
                JSON.stringify({
                    id: file._id.toString(),
                    sheetName,
                    columns,
                    data: data.slice(0, 200), // preview up to 200 rows to avoid huge responses
                    rows_count: data.length,
                    isReadOnly: file.metadata?.isReadOnly || false,
                    category: file.metadata?.category || "Other Tables",
                    subcategory: file.metadata?.subcategory || "Uncategorized",
                    isPriceList: file.metadata?.isPriceList || false,
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // else: return list of files (with metadata) or metadata-only view
        if (metadataOnly) {
            const files = await filesCollection
                .find({ "metadata.userId": userId })
                .sort({ uploadDate: -1 })
                .project({ filename: 1, "metadata.category": 1, "metadata.subcategory": 1, "metadata.isReadOnly": 1, "metadata.isPriceList": 1 })
                .toArray();

            const out = files.map((f) => ({
                id: f._id.toString(),
                filename: f.filename,
                readOnly: f.metadata?.isReadOnly || false,
                category: f.metadata?.category || "Other Tables",
                subcategory: f.metadata?.subcategory || "Uncategorized",
                isPriceList: f.metadata?.isPriceList || false,
                uploadDate: f.uploadDate,
            }));

            return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // return full file list
        const files = await filesCollection.find({ "metadata.userId": userId }).sort({ uploadDate: -1 }).toArray();
        const out = files.map((f) => ({
            id: f._id.toString(),
            filename: f.filename,
            uploadDate: f.uploadDate,
            contentType: f.contentType,
            readOnly: f.metadata?.isReadOnly || false,
            category: f.metadata?.category || "Other Tables",
            subcategory: f.metadata?.subcategory || "Uncategorized",
            isPriceList: f.metadata?.isPriceList || false,
        }));

        return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
        console.error("Error in GET /api/files:", error);
        return new Response(JSON.stringify({ error: "Internal server error", details: String(error?.message ?? error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

/* ------------------------- POST handler (upload) ------------------------- */
export const dynamic = "force-dynamic";

export async function POST(request) {
    let client;
    try {
        const { userId } = getAuth(request);
        if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

        if (!MONGODB_URI) throw new Error("MONGODB_URI missing in environment");

        const { client: connClient, db } = await connectToDatabase();
        client = connClient; // for symmetry with your previous code
        const bucket = new GridFSBucket(db, { bucketName: "excelFiles" });

        const formData = await request.formData();
        const file = formData.get("file");
        const sessionId = formData.get("sessionId");
        const isReadOnly = String(formData.get("isReadOnly") || "") === "true";
        const isPriceList = String(formData.get("isPriceList") || "") === "true";
        const category = formData.get("category") || "Other Tables";
        const subcategory = formData.get("subcategory") || "Uncategorized";

        if (!file) {
            return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (!sessionId) {
            return new Response(JSON.stringify({ error: "Missing session ID" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        // file should be a File object (web file)
        const filename = file.name || `upload-${Date.now()}.bin`;
        if (!filename.match(/\.(xlsx|xls|csv)$/i)) {
            return new Response(JSON.stringify({ error: "Only Excel/CSV files allowed" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // upload to GridFS
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: (() => {
                if (filename.toLowerCase().endsWith(".csv")) return "text/csv";
                if (filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                return "application/octet-stream";
            })(),
            metadata: {
                userId,
                uploadedAt: new Date(),
                sessionId: String(sessionId),
                isReadOnly,
                isPriceList,
                category: String(category),
                subcategory: String(subcategory),
            },
        });

        // write buffer
        const readable = new Readable();
        readable.push(buffer);
        readable.push(null);
        readable.pipe(uploadStream);

        const fileId = await new Promise((resolve, reject) => {
            uploadStream.on("finish", () => resolve(uploadStream.id.toString()));
            uploadStream.on("error", reject);
        });

        // Optionally: return a preview (columns + a few rows) so client can immediately run validate without another GET
        const { sheetName, columns, data } = parseBufferToTable(buffer, filename, uploadStream.options.contentType);
        const previewRows = data.slice(0, 200);

        return new Response(
            JSON.stringify({
                message: "File uploaded successfully",
                fileId,
                filename,
                sessionId: String(sessionId),
                isPriceList,
                category: String(category),
                subcategory: String(subcategory),
                preview: {
                    sheetName,
                    columns,
                    rows_preview: previewRows.length,
                    data_preview: previewRows,
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Upload error:", error);
        return new Response(JSON.stringify({ error: `Upload failed: ${String(error?.message ?? error)}` }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    } finally {
        // do not close cached connection — reuse it (connectToDatabase caches)
    }
}

/* ------------------------- PUT handler (replace existing file) ------------------------- */
export async function PUT(request) {
    try {
        const { userId } = getAuth(request);
        if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

        const url = new URL(request.url);
        const fileId = url.searchParams.get("id");
        if (!fileId || !ObjectId.isValid(fileId)) {
            return new Response(JSON.stringify({ error: "Invalid file ID" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const { db } = await connectToDatabase();
        const filesCollection = db.collection("excelFiles.files");
        const bucket = new GridFSBucket(db, { bucketName: "excelFiles" });

        const existingFile = await filesCollection.findOne({ _id: new ObjectId(fileId), "metadata.userId": userId });
        if (!existingFile) {
            return new Response(JSON.stringify({ error: "File not found or you do not have permission to update it" }), { status: 404, headers: { "Content-Type": "application/json" } });
        }
        if (existingFile.metadata?.isReadOnly) {
            return new Response(JSON.stringify({ error: "Cannot update read-only file" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }

        const updatedData = await request.json();
        const { sheetName, columns, data } = updatedData;
        if (!Array.isArray(columns) || !Array.isArray(data)) {
            return new Response(JSON.stringify({ error: "Invalid payload for file update" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        // delete existing GridFS file object and upload new one with same id
        await bucket.delete(new ObjectId(fileId));

        let fileBuffer;
        if (existingFile.contentType === "text/csv" || existingFile.filename.endsWith(".csv")) {
            const header = columns.join(",");
            const rows = data.map((row) => columns.map((col) => `"${String(row[col] ?? "").replace(/"/g, '""')}"`).join(","));
            const csvContent = [header, ...rows].join("\n");
            fileBuffer = Buffer.from(csvContent, "utf8");
        } else {
            // write xlsx
            const workbook = XLSX.utils.book_new();
            const worksheetData = [columns, ...data.map((row) => columns.map((col) => row[col] ?? ""))];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Sheet1");
            fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        }

        const uploadStream = bucket.openUploadStreamWithId(new ObjectId(fileId), existingFile.filename, {
            contentType: existingFile.contentType,
            metadata: existingFile.metadata,
        });

        const readable = new Readable();
        readable.push(fileBuffer);
        readable.push(null);

        await new Promise((resolve, reject) => {
            readable.pipe(uploadStream).on("finish", resolve).on("error", reject);
        });

        return new Response(JSON.stringify({ message: "File updated successfully" }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
        console.error("Error in PUT /api/files:", error);
        return new Response(JSON.stringify({ error: "Internal server error", details: String(error?.message ?? error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
