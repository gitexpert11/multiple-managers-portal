import { strToU8, zipSync } from 'fflate';

/**
 * Minimal Office Open XML (.xlsx) writer.
 *
 * Produces a genuine Excel workbook (a zip of XML parts) without pulling in a
 * spreadsheet library. Supports: multiple sheets, bold header row, real date
 * cells, numeric cells with a 2-decimal format, column widths and an
 * autofilter on the header row. Strings are written inline, so no shared
 * string table is needed.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type XlsxCell = string | number | null | undefined | { type: 'date'; value: string } | { type: 'number'; value: number } | { type: 'string'; value: string; bold?: boolean };

export interface XlsxColumn {
  header: string;
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
  totals?: XlsxCell[];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

const STYLE = { normal: 0, bold: 1, date: 2, number: 3, boldNumber: 4 };

/** @returns zipped workbook bytes */
export function buildXlsx(workbook: XlsxWorkbook): Uint8Array {
  const sheets = (workbook?.sheets || []).filter(Boolean);
  if (!sheets.length) throw new Error('Workbook needs at least one sheet');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml(sheets.length)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'xl/workbook.xml': strToU8(workbookXml(sheets)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml(sheets.length)),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

/** Excel stores dates as days since 1899-12-30. */
export function excelDateSerial(dayKey: string): number {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${dayKey}`);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Excel sheet names: max 31 chars, none of []:*?/\ and not blank. */
export function sanitizeSheetName(name: unknown, fallback = 'Sheet'): string {
  const cleaned = String(name ?? '')
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || fallback;
}

export function columnLetter(index: number /* 0-based */): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function escapeXml(text: unknown): string {
  return String(text).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

// ---------------------------------------------------------------------------

function sheetXml(sheet: XlsxSheet): string {
  const columns = sheet.columns || [];
  const rows = sheet.rows || [];
  const lines: string[] = [];
  let rowIndex = 1;

  const pushRow = (cells: XlsxCell[], { bold = false } = {}) => {
    const xml = cells
      .map((cell, c) => cellXml(cell, `${columnLetter(c)}${rowIndex}`, bold))
      .filter(Boolean)
      .join('');
    lines.push(`<row r="${rowIndex}">${xml}</row>`);
    rowIndex += 1;
  };

  pushRow(
    columns.map((c) => c.header),
    { bold: true },
  );
  for (const r of rows) pushRow(r);
  if (sheet.totals) pushRow(sheet.totals, { bold: true });

  const lastCol = columnLetter(Math.max(columns.length - 1, 0));
  const cols = columns.length
    ? `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(c.width) > 0 ? c.width : 14}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const filterRows = 1 + rows.length; // header + data (totals excluded)
  const autoFilter = columns.length && rows.length ? `<autoFilter ref="A1:${lastCol}${filterRows}"/>` : '';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    cols +
    `<sheetData>${lines.join('')}</sheetData>` +
    autoFilter +
    `</worksheet>`
  );
}

function cellXml(cell: XlsxCell, ref: string, boldRow: boolean): string {
  if (cell == null || cell === '') return '';
  const type: string = typeof cell === 'object' ? cell.type : typeof cell === 'number' ? 'number' : 'string';
  const value: unknown = typeof cell === 'object' ? cell.value : cell;
  const bold = boldRow || (typeof cell === 'object' && 'bold' in cell && Boolean(cell.bold));
  if (value == null || value === '') return '';

  if (type === 'date') {
    return `<c r="${ref}" s="${STYLE.date}"><v>${excelDateSerial(String(value))}</v></c>`;
  }
  if (type === 'number') {
    const n = Number(value);
    // Non-finite "numbers" fall through and are written as strings.
    if (Number.isFinite(n)) return `<c r="${ref}" s="${bold ? STYLE.boldNumber : STYLE.number}"><v>${n}</v></c>`;
  }
  return `<c r="${ref}" s="${bold ? STYLE.bold : STYLE.normal}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
    `</Types>`
  );
}

function workbookXml(sheets: XlsxSheet[]): string {
  const used = new Set<string>();
  const entries = sheets
    .map((s, i) => {
      let name = sanitizeSheetName(s.name, `Sheet${i + 1}`);
      let n = 2;
      while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${n++}`;
      used.add(name.toLowerCase());
      return `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${entries}</sheets></workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels +
    `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;
