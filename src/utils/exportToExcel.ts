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
