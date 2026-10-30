import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildPdf, encodeWinAnsi, escapePdfString, PDF_MIME, textWidth, truncate } from './pdf';
import { buildXlsx, columnLetter, escapeXml, excelDateSerial, sanitizeSheetName, XLSX_MIME, type XlsxSheet } from './xlsx';

const unzip = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

const sheet = (over: Partial<XlsxSheet> = {}): XlsxSheet => ({
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
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    expect(XLSX_MIME).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('writes a bold header row, date cells, numeric cells, inline strings and a totals row', () => {
    const xml = unzip(buildXlsx({ sheets: [sheet()] }))['xl/worksheets/sheet1.xml'] as string;
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Date</t></is></c>');
    expect(xml).toContain(`<c r="A2" s="2"><v>${excelDateSerial('2025-03-10')}</v></c>`);
    expect(xml).toContain('<c r="C2" s="3"><v>12.5</v></c>');
    expect(xml).toContain('<c r="C3" s="3"><v>1200</v></c>');
    expect(xml).toContain('<t xml:space="preserve">Food &amp; Dining</t>');
    expect(xml).toContain('<row r="4"><c r="A4" s="1" t="inlineStr"><is><t xml:space="preserve">Total</t></is></c><c r="C4" s="4"><v>1212.5</v></c></row>');
    expect(xml).toContain('<autoFilter ref="A1:C3"/>');
    expect(xml).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
  });

  it('sanitises and de-duplicates sheet names and rejects empty workbooks', () => {
    const wb = unzip(buildXlsx({ sheets: [sheet({ name: 'A/B:C' }), sheet({ name: 'a/b:c' })] }))['xl/workbook.xml'] as string;
    expect(wb).toContain('name="A B C"');
    expect(wb).toContain('name="a b c 2"');
    expect(() => buildXlsx({ sheets: [] })).toThrow();
  });

  it('has helpers that behave', () => {
    expect(excelDateSerial('1899-12-31')).toBe(1);
    expect(excelDateSerial('2025-03-10')).toBe(45726);
    expect(() => excelDateSerial('nope')).toThrow();
    expect(sanitizeSheetName('  x '.repeat(20))).toHaveLength(31);
    expect(sanitizeSheetName('')).toBe('Sheet');
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });
});

describe('buildPdf', () => {
  const doc = {
    title: 'Report',
    subtitle: 'March 2025',
    metaLines: ['Generated 2025-03-15'],
    sections: [
      { heading: 'Summary', columns: [{ label: 'Month', width: 3 }, { label: 'Total', width: 2, align: 'right' as const }], rows: [['March 2025', '1,212.50']], totals: ['Total', '1,212.50'] },
      { heading: 'Empty', columns: [{ label: 'X', width: 1 }], rows: [], emptyText: 'Nothing here' },
    ],
    footerText: 'Expense Tracker',
  };

  it('writes a well-formed single-page PDF with fonts, content and an xref table', () => {
    const bytes = buildPdf(doc);
    const text = String.fromCharCode(...bytes);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(text).toContain('/BaseFont /Helvetica');
    expect(text).toContain('/BaseFont /Helvetica-Bold');
    expect(text).toContain('/Count 1');
    expect(text).toContain('(Report) Tj');
    expect(text).toContain('(Nothing here) Tj');
    expect(text).toContain('(Page 1 of 1) Tj');
    expect(PDF_MIME).toBe('application/pdf');
    // xref offsets must point at "N 0 obj"
    const xrefPos = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xrefPos, xrefPos + 4)).toBe('xref');
    const firstOffset = Number(/xref\n0 \d+\n0000000000 65535 f \n(\d{10})/.exec(text)?.[1]);
    expect(text.slice(firstOffset, firstOffset + 7)).toBe('1 0 obj');
  });

  it('paginates long tables and repeats the header', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Row ${i}`, String(i)]);
    const text = String.fromCharCode(...buildPdf({ ...doc, sections: [{ heading: 'Long', columns: doc.sections[0]!.columns, rows }] }));
    expect(text).toContain('/Count 3');
    expect(text).toContain('(Page 3 of 3) Tj');
    expect(text.match(/\(Month\) Tj/g)?.length).toBe(3);
  });

  it('encodes WinAnsi, escapes parentheses and truncates long cells', () => {
    expect(encodeWinAnsi('café €5 — “ok” ✓')).toBe('café \x805 \x97 \x93ok\x94 ?');
    expect(escapePdfString('a(b)\\c')).toBe('a\\(b\\)\\\\c');
    expect(textWidth('Hello', 10)).toBeCloseTo(22.78, 1); // H(722)+e(556)+l(222)+l(222)+o(556) = 2278/1000 em
    expect(textWidth('Hello', 10, true)).toBeGreaterThan(textWidth('Hello', 10));
    expect(truncate('A very long description that will not fit', 40, 8)).toMatch(/…$/);
    expect(truncate('Short', 400, 8)).toBe('Short');
    expect(() => buildPdf({ title: 'x' } as never)).toThrow();
  });
});
