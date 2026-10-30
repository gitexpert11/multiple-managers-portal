/**
 * Minimal PDF writer for tabular reports.
 *
 * Hand-writes a PDF 1.4 file using the standard Helvetica / Helvetica-Bold
 * fonts (always available in every viewer), so no font embedding and no
 * dependency is needed. Supports a title block, multiple titled tables with
 * repeated header rows across page breaks, right-aligned numeric columns, bold
 * totals rows, and "Page x of y" footers.
 *
 * Text is encoded as WinAnsi; characters outside that set are replaced with
 * "?" (callers should format currency with ISO codes rather than symbols).
 */

export const PDF_MIME = 'application/pdf';

export const PAGE = { width: 595.28, height: 841.89, margin: 40 }; // A4 portrait, points
const FONT = { body: 8.5, heading: 11, title: 16, subtitle: 10, footer: 8 };
const ROW_H = 14;
const HEADER_H = 16;
const SECTION_GAP = 18;

export interface PdfColumn {
  label: string;
  /** Relative weight. */
  width: number;
  align?: 'left' | 'right';
}

export interface PdfSection {
  heading: string;
  columns: PdfColumn[];
  rows: string[][];
  totals?: string[];
  emptyText?: string;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  metaLines?: string[];
  sections: PdfSection[];
  footerText?: string;
}

type Ops = string[];

export function buildPdf(doc: PdfDocument): Uint8Array {
  if (!doc || !Array.isArray(doc.sections)) throw new Error('PDF document needs sections');
  const pages = layoutPages(doc);
  return serialize(pages);
}

// ---------------------------------------------------------------------------
// Layout

function layoutPages(doc: PdfDocument): Ops[] {
  const contentW = PAGE.width - PAGE.margin * 2;
  const pages: Ops[] = [];
  let ops: Ops = [];
  let y = 0;

  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE.height - PAGE.margin;
  };
  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin + 18) newPage();
  };

  newPage();

  // Title block
  text(ops, doc.title || 'Report', PAGE.margin, y - FONT.title, FONT.title, true);
  y -= FONT.title + 6;
  if (doc.subtitle) {
    text(ops, doc.subtitle, PAGE.margin, y - FONT.subtitle, FONT.subtitle, false, 0.35);
    y -= FONT.subtitle + 4;
  }
  for (const line of doc.metaLines || []) {
    text(ops, line, PAGE.margin, y - FONT.footer, FONT.footer, false, 0.45);
    y -= FONT.footer + 3;
  }
  y -= 8;

  for (const section of doc.sections) {
    const weights = section.columns.map((c) => Math.max(Number(c.width) || 1, 0.1));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colW = weights.map((w) => (w / totalW) * contentW);
    const colX = colW.map((_, i) => PAGE.margin + colW.slice(0, i).reduce((a, b) => a + b, 0));

    const drawHeader = () => {
      rect(ops, PAGE.margin, y - HEADER_H, contentW, HEADER_H, 0.92);
      section.columns.forEach((col, i) => cellText(ops, col.label, colX[i] as number, y - HEADER_H + 4.5, colW[i] as number, col.align, FONT.body, true));
      y -= HEADER_H;
    };

    ensure(FONT.heading + 8 + HEADER_H + ROW_H);
    y -= 4;
    text(ops, section.heading, PAGE.margin, y - FONT.heading, FONT.heading, true);
    y -= FONT.heading + 6;
    drawHeader();

    if (!section.rows.length) {
      ensure(ROW_H);
      text(ops, section.emptyText || 'No entries', PAGE.margin + 4, y - ROW_H + 4, FONT.body, false, 0.45);
      y -= ROW_H;
    }

    for (const row of section.rows) {
      if (y - ROW_H < PAGE.margin + 18) {
        newPage();
        drawHeader();
      }
      line(ops, PAGE.margin, y - ROW_H, PAGE.margin + contentW, y - ROW_H, 0.85);
      section.columns.forEach((col, i) => cellText(ops, row[i] ?? '', colX[i] as number, y - ROW_H + 4, colW[i] as number, col.align, FONT.body, false));
      y -= ROW_H;
    }

    if (section.totals) {
      const totals = section.totals;
      if (y - ROW_H < PAGE.margin + 18) {
        newPage();
        drawHeader();
      }
      line(ops, PAGE.margin, y, PAGE.margin + contentW, y, 0.4);
      section.columns.forEach((col, i) => cellText(ops, totals[i] ?? '', colX[i] as number, y - ROW_H + 4, colW[i] as number, col.align, FONT.body, true));
      y -= ROW_H;
    }
    y -= SECTION_GAP;
  }

  // Footers need the final page count.
  pages.forEach((pageOps, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const w = textWidth(label, FONT.footer, false);
    text(pageOps, label, PAGE.width - PAGE.margin - w, PAGE.margin - 14, FONT.footer, false, 0.45);
    if (doc.footerText) text(pageOps, doc.footerText, PAGE.margin, PAGE.margin - 14, FONT.footer, false, 0.45);
  });

  return pages;
}

function cellText(ops: Ops, value: unknown, x: number, y: number, width: number, align: 'left' | 'right' | undefined, size: number, bold: boolean) {
  const padding = 4;
  const str = truncate(String(value ?? ''), width - padding * 2, size, bold);
  const w = textWidth(str, size, bold);
  const tx = align === 'right' ? x + width - padding - w : x + padding;
  text(ops, str, tx, y, size, bold);
}

// ---------------------------------------------------------------------------
// Drawing primitives (content stream operators)

function text(ops: Ops, str: string, x: number, y: number, size: number, bold = false, gray = 0) {
  ops.push(`BT ${gray} g /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(y)} Td (${escapePdfString(encodeWinAnsi(str))}) Tj ET`);
}

function rect(ops: Ops, x: number, y: number, w: number, h: number, gray: number) {
  ops.push(`${gray} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f 0 g`);
}

function line(ops: Ops, x1: number, y1: number, x2: number, y2: number, gray: number) {
  ops.push(`${gray} G 0.5 w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S 0 G`);
}

function num(n: number): string {
  return Number(n.toFixed(2)).toString();
}

// ---------------------------------------------------------------------------
// Text metrics (Helvetica AFM widths, 1/1000 em, for WinAnsi 32..126)

const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 48-63
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // 64-79
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 80-95
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // 96-111
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // 112-126
];

export function textWidth(str: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of encodeWinAnsi(String(str))) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? (HELVETICA_WIDTHS[code - 32] as number) : 556;
  }
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

export function truncate(str: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(str, size, bold) <= maxWidth) return str;
  const ellipsis = '…';
  let out = str;
  while (out.length && textWidth(out + ellipsis, size, bold) > maxWidth) out = out.slice(0, -1);
  return out + ellipsis;
}

// ---------------------------------------------------------------------------
// Encoding

const WINANSI_EXTRA = new Map<string, number>([
  ['\u20AC', 0x80], ['\u2018', 0x91], ['\u2019', 0x92], ['\u201C', 0x93], ['\u201D', 0x94],
  ['\u2022', 0x95], ['\u2013', 0x96], ['\u2014', 0x97], ['\u2026', 0x85], ['\u2122', 0x99],
]);

/** Map a JS string to a byte-string (each char code <= 255) in WinAnsi. */
export function encodeWinAnsi(str: string): string {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0) as number;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (WINANSI_EXTRA.has(ch)) out += String.fromCharCode(WINANSI_EXTRA.get(ch) as number);
    else out += '?';
  }
  return out;
}

export function escapePdfString(byteStr: string): string {
  return byteStr.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

// ---------------------------------------------------------------------------
// Serialisation (xref table must contain exact byte offsets)

function serialize(pages: Ops[]): Uint8Array {
  const objects: string[] = []; // byte-strings, index + 1 = object number
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add(''); // placeholder, filled once we know the pages object
  const pagesObj = add('');
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageIds: number[] = [];
  for (const ops of pages) {
    const stream = ops.join('\n');
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(PAGE.width)} ${num(PAGE.height)}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
