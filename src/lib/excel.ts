type ExcelCell = string | number | boolean | null | undefined;

function xml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Creates an Excel-readable SpreadsheetML workbook without a runtime dependency. */
export function downloadExcelSheet(sheetName: string, headers: string[], rows: ExcelCell[][], filename: string) {
  const safeSheetName = sheetName.replace(/[\\/?*:[\]]/g, ' ').slice(0, 31) || 'Datos';
  const allRows = [headers, ...rows];
  const worksheetRows = allRows.map((row) => `<Row>${row.map((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
    if (typeof value === 'boolean') return `<Cell><Data ss:Type="String">${value ? 'Sí' : 'No'}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xml(String(value ?? ''))}</Data></Cell>`;
  }).join('')}</Row>`).join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xml(safeSheetName)}"><Table>${worksheetRows}</Table></Worksheet></Workbook>`;
  const blob = new Blob([`\uFEFF${workbook}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
