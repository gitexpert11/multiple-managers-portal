import { describe, expect, it } from 'vitest';
import { buildPdf, encodeWinAnsi, escapePdfString, PAGE, PDF_MIME, textWidth, truncate } from '../src/lib/export/pdf.js';

const toLatin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

const doc = (over = {}) => ({
  title: 'Expense Tracker report',
  subtitle: 'March 2025 · Expenses',
  metaLines: ['Currency: USD'],
  sections: [
    {
      heading: 'Expenses',
      columns: [
        { label: 'Date', width: 1 },
        { label: 'Description', width: 3 },
        { label: 'Amount', width: 1, align: 'right' },
      ],
      rows: [
        ['2025-03-10', 'Lunch (team)', '12.50'],
        ['2025-03-11', 'Rent', '1,200.00'],
      ],
      totals: ['Total', '2 transactions', '1,212.50'],
    },
  ],
  footerText: 'Expense Tracker',
  ...over,
});

/** Parse the xref table and check each offset points at "N 0 obj". */
function checkXref(pdf) {
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)[1]);
  expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
  const header = /xref\n0 (\d+)\n/.exec(pdf.slice(startxref));
  const count = Number(header[1]);
  const entries = pdf.slice(startxref + header[0].length).split('\n').slice(0, count);
  expect(entries[0]).toBe('0000000000 65535 f ');
  for (let i = 1; i < count; i++) {
    const offset = Number(entries[i].slice(0, 10));
    expect(pdf.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  }
  return count;
}

describe('buildPdf', () => {
  it('produces a structurally valid single-page PDF', () => {
    const bytes = buildPdf(doc());
    expect(bytes).toBeInstanceOf(Uint8Array);
    const pdf = toLatin1(bytes);
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain('/BaseFont /Helvetica ');
    expect(pdf).toContain('/BaseFont /Helvetica-Bold');
    expect(pdf).toContain(`/MediaBox [0 0 ${PAGE.width} ${PAGE.height}]`);
    const objectCount = checkXref(pdf) - 1;
    expect(objectCount).toBe(4 + 2); // catalog, pages, 2 fonts, 1 page + 1 content
    expect(PDF_MIME).toBe('application/pdf');
  });

  it('contains the title, headings, cells, totals and page footer as text', () => {
    const pdf = toLatin1(buildPdf(doc()));
    for (const s of ['Expense Tracker report', 'March 2025 \xb7 Expenses', 'Currency: USD', 'Expenses', 'Date', 'Description', 'Amount', '2025-03-10', 'Rent', '1,200.00', 'Total', '2 transactions', 'Page 1 of 1', 'Expense Tracker']) {
      expect(pdf, s).toContain(`(${escapePdfString(encodeWinAnsi(s))}) Tj`);
    }
  });

  it('escapes parentheses and backslashes inside text', () => {
    const pdf = toLatin1(buildPdf(doc()));
    expect(pdf).toContain('(Lunch \\(team\\)) Tj');
    const withSlash = toLatin1(buildPdf(doc({ sections: [{ heading: 'H', columns: [{ label: 'x', width: 1 }], rows: [['a\\b']] }] })));
    expect(withSlash).toContain('(a\\\\b) Tj');
  });

  it('paginates long tables, repeating the header row and numbering pages', () => {
    const rows = Array.from({ length: 150 }, (_, i) => [`2025-01-${String((i % 28) + 1).padStart(2, '0')}`, `Row ${i}`, `${i}.00`]);
    const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows }] })));
    const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect((pdf.match(/\(Description\) Tj/g) || []).length).toBe(pages); // header repeated once per page
    for (let i = 1; i <= pages; i++) expect(pdf).toContain(`(Page ${i} of ${pages}) Tj`);
    expect(pdf).toContain('(Row 149) Tj');
    expect(pdf).toContain('(Total) Tj');
    checkXref(pdf);
  });

  it('renders several sections in order', () => {
    const pdf = toLatin1(buildPdf(doc({ sections: [doc().sections[0], { ...doc().sections[0], heading: 'Income', rows: [['2025-03-01', 'Salary', '4,000.00']] }] })));
    expect(pdf.indexOf('(Expenses) Tj')).toBeLessThan(pdf.indexOf('(Income) Tj'));
    expect(pdf).toContain('(Salary) Tj');
  });

  it('shows a placeholder for an empty section', () => {
    const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows: [], totals: undefined, emptyText: 'No expenses in this range' }] })));
    expect(pdf).toContain('(No expenses in this range) Tj');
  });

  it('truncates cell text that does not fit its column', () => {
    const long = 'x'.repeat(400);
    const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows: [['2025-03-10', long, '1.00']] }] })));
    expect(pdf).not.toContain(long);
    expect(pdf).toMatch(/\(x+\x85\) Tj/); // ends with a WinAnsi ellipsis
  });

  it('replaces characters outside WinAnsi with "?" and keeps Latin-1 and the euro sign', () => {
    const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows: [['2025-03-10', 'Café ₹ € — ok', '1.00']] }] })));
    expect(pdf).toContain('(Caf\xe9 ? \x80 \x97 ok) Tj');
  });

  it('rejects a document without sections', () => {
    expect(() => buildPdf({})).toThrow(/sections/);
    expect(() => buildPdf(null)).toThrow(/sections/);
  });

  it('declares content stream lengths that match the stream bytes', () => {
    const pdf = toLatin1(buildPdf(doc()));
    const re = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g;
    let m;
    let streams = 0;
    while ((m = re.exec(pdf))) {
      expect(m[2].length).toBe(Number(m[1]));
      streams += 1;
    }
    expect(streams).toBe(1);
  });
});

describe('text helpers', () => {
  it('textWidth uses Helvetica metrics and scales with size/bold', () => {
    expect(textWidth('iii', 10)).toBeLessThan(textWidth('WWW', 10));
    expect(textWidth('abc', 20)).toBeCloseTo(textWidth('abc', 10) * 2);
    expect(textWidth('abc', 10, true)).toBeGreaterThan(textWidth('abc', 10));
    expect(textWidth('', 10)).toBe(0);
  });

  it('truncate keeps short strings and appends an ellipsis to long ones', () => {
    expect(truncate('short', 1000, 9)).toBe('short');
    const out = truncate('a fairly long description', 40, 9);
    expect(out.endsWith('…')).toBe(true);
    expect(textWidth(out, 9)).toBeLessThanOrEqual(40);
    expect(out.length).toBeLessThan('a fairly long description'.length);
  });

  it('encodeWinAnsi maps typographic punctuation and drops the rest', () => {
    expect(encodeWinAnsi('a\u2019b\u201cc\u201d\u2013\u2014\u2026€')).toBe('a\x92b\x93c\x94\x96\x97\x85\x80');
    expect(encodeWinAnsi('日本')).toBe('??');
    expect(encodeWinAnsi('\u00e9\u00ff')).toBe('\u00e9\u00ff');
  });

  it('escapePdfString escapes delimiters and line breaks', () => {
    expect(escapePdfString('(a)\\b\nc')).toBe('\\(a\\)\\\\b\\nc');
  });
});

describe('pagination edge cases', () => {
  it('edge: a totals row that does not fit moves to a new page together with a repeated header', () => {
    // Fill the first page so that exactly the totals row would overflow.
    const rowsPerPage = Math.floor((PAGE.height - PAGE.margin * 2 - 80) / 14);
    for (let n = rowsPerPage - 2; n <= rowsPerPage + 2; n++) {
      const rows = Array.from({ length: n }, (_, i) => [`2025-01-01`, `Row ${i}`, '1']);
      const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows }] })));
      const pages = Number(/\/Count (\d+)/.exec(pdf)[1]);
      expect(pdf).toContain('(Total) Tj');
      expect((pdf.match(/\(Description\) Tj/g) || []).length).toBe(pages); // header on every page, incl. a totals-only page
      for (let p = 1; p <= pages; p++) expect(pdf).toContain(`(Page ${p} of ${pages}) Tj`);
    }
  });

  it('negative: a row with fewer cells than columns is padded, never crashes', () => {
    const pdf = toLatin1(buildPdf(doc({ sections: [{ ...doc().sections[0], rows: [['2025-01-01']], totals: ['Total'] }] })));
    expect(pdf).toContain('(2025-01-01) Tj');
    expect(pdf).toContain('(Total) Tj');
  });
});
