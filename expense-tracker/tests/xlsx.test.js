import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildXlsx, columnLetter, escapeXml, excelDateSerial, sanitizeSheetName, XLSX_MIME } from '../src/lib/export/xlsx.js';

const unzip = (bytes) => {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
};

const sheet = (over = {}) => ({
  name: 'Expenses',
  columns: [
    { header: 'Date', width: 12 },
    { header: 'Category', width: 20 },
    { header: 'Amount (USD)', width: 16 },
  ],
  rows: [
    [{ type: 'date', value: '2025-03-10' }, 'Food & Dining', { type: 'number', value: 12.5 }],
    [{ type: 'date', value: '2025-03-11' }, 'Rent <big>', 1200],
  ],
  totals: ['Total', '', { type: 'number', value: 1212.5 }],
  ...over,
});

describe('buildXlsx', () => {
  it('produces a zip with all required OOXML parts', () => {
    const files = unzip(buildXlsx({ sheets: [sheet()] }));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet1.xml');
    expect(files['_rels/.rels']).toContain('Target="xl/workbook.xml"');
    expect(files['xl/_rels/workbook.xml.rels']).toContain('Target="worksheets/sheet1.xml"');
    expect(files['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
    expect(XLSX_MIME).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('writes a bold header row, date cells, numeric cells and inline strings', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet()] }))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Date</t></is></c>');
    expect(xml).toContain(`<c r="A2" s="2"><v>${excelDateSerial('2025-03-10')}</v></c>`);
    expect(xml).toContain('<c r="C2" s="3"><v>12.5</v></c>');
    expect(xml).toContain('<c r="C3" s="3"><v>1200</v></c>'); // plain number shorthand
    expect(xml).toContain('<t xml:space="preserve">Food &amp; Dining</t>');
    expect(xml).toContain('<t xml:space="preserve">Rent &lt;big&gt;</t>');
  });

  it('writes a bold totals row after the data and excludes it from the autofilter', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet()] }))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<row r="4"><c r="A4" s="1" t="inlineStr"><is><t xml:space="preserve">Total</t></is></c><c r="C4" s="4"><v>1212.5</v></c></row>');
    expect(xml).toContain('<autoFilter ref="A1:C3"/>');
    expect(xml).toContain('state="frozen"');
  });

  it('sets column widths', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet()] }))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<col min="1" max="1" width="12" customWidth="1"/>');
    expect(xml).toContain('<col min="3" max="3" width="16" customWidth="1"/>');
  });

  it('skips empty cells and omits the autofilter when there are no rows', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet({ rows: [], totals: undefined })] }))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('<row r="1">');
    expect(xml).not.toContain('<row r="2">');
    expect(xml).not.toContain('autoFilter');
  });

  it('supports multiple sheets with sanitised, unique names', () => {
    const files = unzip(buildXlsx({ sheets: [sheet({ name: 'Summary' }), sheet({ name: 'Bad/Name:Here?' }), sheet({ name: 'Summary' })] }));
    expect(files['xl/workbook.xml']).toContain('<sheet name="Summary" sheetId="1" r:id="rId1"/>');
    expect(files['xl/workbook.xml']).toContain('<sheet name="Bad Name Here" sheetId="2" r:id="rId2"/>');
    expect(files['xl/workbook.xml']).toContain('<sheet name="Summary 2" sheetId="3" r:id="rId3"/>');
    expect(files['xl/worksheets/sheet3.xml']).toBeTruthy();
    expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet3.xml');
  });

  it('rejects a workbook without sheets', () => {
    expect(() => buildXlsx({ sheets: [] })).toThrow(/sheet/);
    expect(() => buildXlsx(null)).toThrow(/sheet/);
  });

  it('treats non-finite numbers as text rather than corrupting the file', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet({ rows: [[{ type: 'number', value: 'abc' }]], totals: undefined })] }))['xl/worksheets/sheet1.xml'];
    expect(xml).toContain('t="inlineStr"><is><t xml:space="preserve">abc</t>');
  });
});

describe('helpers', () => {
  it('excelDateSerial matches known Excel values', () => {
    expect(excelDateSerial('1900-01-01')).toBe(2); // Excel's 1900 leap-year quirk shifts epoch by one
    expect(excelDateSerial('1970-01-01')).toBe(25569);
    expect(excelDateSerial('2025-03-10')).toBe(45726);
    expect(() => excelDateSerial('nope')).toThrow(/Invalid date/);
  });

  it('columnLetter handles single and multi-letter columns', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(columnLetter(702)).toBe('AAA');
  });

  it('sanitizeSheetName strips illegal characters, trims and caps at 31 chars', () => {
    expect(sanitizeSheetName('  Income  ')).toBe('Income');
    expect(sanitizeSheetName('a[b]c:d*e?f/g\\h')).toBe('a b c d e f g h');
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName('')).toBe('Sheet');
    expect(sanitizeSheetName(null, 'Fallback')).toBe('Fallback');
  });

  it('escapeXml escapes the five special characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;');
  });
});
