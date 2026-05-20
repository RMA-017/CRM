function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeSheetName(value, fallback) {
  const normalized = String(value || fallback || "Sheet")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "Sheet").slice(0, 31);
}

function getCellType(value) {
  return typeof value === "number" && Number.isFinite(value) ? "Number" : "String";
}

function buildRowXml(row) {
  return `<Row>${row.map((value) => (
    `<Cell><Data ss:Type="${getCellType(value)}">${escapeXml(value)}</Data></Cell>`
  )).join("")}</Row>`;
}

export function exportExcelWorkbook(filename, sheets) {
  const safeSheets = (Array.isArray(sheets) ? sheets : [])
    .map((sheet, index) => ({
      name: normalizeSheetName(sheet?.name, `Sheet ${index + 1}`),
      rows: Array.isArray(sheet?.rows) ? sheet.rows : []
    }))
    .filter((sheet) => sheet.rows.length > 0);

  if (safeSheets.length === 0) {
    return false;
  }

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1" /><Interior ss:Color="#D9EAF7" ss:Pattern="Solid" /></Style>
  </Styles>
  ${safeSheets.map((sheet) => (
    `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${sheet.rows.map((row, rowIndex) => {
      if (rowIndex !== 0) return buildRowXml(row);
      return `<Row>${row.map((value) => (
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`
      )).join("")}</Row>`;
    }).join("")}</Table></Worksheet>`
  )).join("")}
</Workbook>`;

  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function buildExportFilename(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}.xls`;
}
