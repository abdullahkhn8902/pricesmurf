// lib/fileProcessor.ts
import { parse } from 'csv-parse/sync'
import * as XLSX from 'xlsx'

export async function processFileBuffer(buffer: Buffer, filename: string, contentType?: string) {
    // returns { columns: string[], data: Array<Record<string,string>> }
    let columns: string[] = []
    let data: Array<Record<string, any>> = []

    const isCSV = () => {
        if (contentType && typeof contentType === 'string') {
            if (contentType.toLowerCase().includes('csv')) return true
            if (contentType.toLowerCase().includes('spreadsheet') || contentType.toLowerCase().includes('excel')) return false
        }
        if (filename && typeof filename === 'string') {
            const n = filename.toLowerCase()
            if (n.endsWith('.csv')) return true
            if (n.endsWith('.xlsx') || n.endsWith('.xls')) return false
        }
        // fallback: try csv parse
        return true
    }

    if (isCSV()) {
        const records = parse(buffer.toString('utf8'), {
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        })

        const rawHeader = records[0] || []
        const hasIndexColumn = rawHeader.length > 0 && rawHeader[0] !== null && /^(\d+)$/.test(String(rawHeader[0]).trim())
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

        columns = rawColumns.map((c: any) => String(c || '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed')

        data = records.slice(1).map((row: any) => {
            const processedRow = hasIndexColumn ? row.slice(1) : row
            const obj: Record<string, any> = {}
            columns.forEach((col, i) => {
                obj[col] = processedRow[i] !== undefined && processedRow[i] !== null ? processedRow[i] : ''
            })
            return obj
        })
    } else {
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

        const rawHeader = jsonData[0] || []
        const hasIndexColumn = rawHeader.length > 0 && rawHeader[0] !== null && /^(\d+)$/.test(String(rawHeader[0]).trim())
        const rawColumns = hasIndexColumn ? rawHeader.slice(1) : rawHeader

        columns = rawColumns.map((c: any) => String(c || '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim() || 'Unnamed')

        data = jsonData.slice(1).map((row) => {
            const processedRow = hasIndexColumn ? row.slice(1) : row
            const obj: Record<string, any> = {}
            columns.forEach((col, i) => {
                obj[col] = processedRow[i] !== undefined && processedRow[i] !== null ? processedRow[i] : ''
            })
            return obj
        })
    }

    return { columns, data }
}
