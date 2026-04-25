import * as XLSX from 'xlsx';

/**
 * Export data to Excel file
 * @param data - Array of objects to export
 * @param filename - Name of the file (without extension)
 * @param sheetName - Name of the worksheet (optional, defaults to 'Sheet1')
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Sheet1'
) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  try {
    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Convert data to worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    const colWidths = Object.keys(data[0]).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...data.map((row) => {
          const value = row[key];
          return value ? String(value).length : 0;
        })
      );
      return { wch: Math.min(maxLength + 2, 50) }; // Cap at 50 characters
    });
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}.xlsx`;

    // Write file
    XLSX.writeFile(wb, fullFilename);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
}

/**
 * Sanitize a sheet name for Excel (max 31 chars, no special chars: \ / ? * [ ] :)
 */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31);
}

/**
 * Export multiple datasets to Excel, each as its own sheet.
 * @param sheets - Array of { name, data } objects, one per sheet
 * @param filename - Name of the file (without extension)
 */
export function exportToExcelMultiSheet<T extends Record<string, any>>(
  sheets: { name: string; data: T[] }[],
  filename: string
) {
  if (!sheets || sheets.length === 0) {
    throw new Error('No sheets to export');
  }

  try {
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    sheets.forEach((sheet, idx) => {
      if (!sheet.data || sheet.data.length === 0) return;

      const ws = XLSX.utils.json_to_sheet(sheet.data);

      // Auto-size columns based on this sheet's data
      const colWidths = Object.keys(sheet.data[0]).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...sheet.data.map((row) => {
            const value = row[key];
            return value ? String(value).length : 0;
          })
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      ws['!cols'] = colWidths;

      // Ensure unique sanitized sheet name
      let sheetName = sanitizeSheetName(sheet.name) || `Sheet${idx + 1}`;
      let suffix = 2;
      const base = sheetName;
      while (usedNames.has(sheetName)) {
        const suffixStr = ` (${suffix})`;
        sheetName = sanitizeSheetName(base.slice(0, 31 - suffixStr.length) + suffixStr);
        suffix++;
      }
      usedNames.add(sheetName);

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    if (wb.SheetNames.length === 0) {
      throw new Error('No data to export');
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}.xlsx`;
    XLSX.writeFile(wb, fullFilename);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
}
