import { TranscriptEntry } from './types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FONT_SIZE = 11;
const FOOTER_FONT_SIZE = 10;
const LINE_HEIGHT = 15;
const MAX_CHARS_PER_LINE = 78;
const BODY_LINES_PER_PAGE = 42;

const ASCII_REPLACEMENTS: Record<string, string> = {
  '\u00a0': ' ',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2026': '...'
};

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[^\x00-\x7F]/g, (character) => ASCII_REPLACEMENTS[character] ?? '?');
}

function wrapLine(line: string): string[] {
  if (line.length === 0) {
    return [''];
  }

  const wrapped: string[] = [];
  let remaining = line;

  while (remaining.length > MAX_CHARS_PER_LINE) {
    let breakIndex = remaining.lastIndexOf(' ', MAX_CHARS_PER_LINE);
    if (breakIndex <= 0) {
      breakIndex = MAX_CHARS_PER_LINE;
    }

    wrapped.push(remaining.slice(0, breakIndex).trimEnd());
    remaining = remaining.slice(breakIndex).trimStart();
  }

  wrapped.push(remaining);
  return wrapped;
}

function buildTranscriptLines(transcript: readonly TranscriptEntry[]): string[] {
  const lines: string[] = [
    'CISSP Buddy Transcript',
    `Exported ${normalizeText(new Date().toLocaleString())}`,
    ''
  ];

  if (transcript.length === 0) {
    lines.push('No transcript entries were available.');
    return lines;
  }

  for (const entry of transcript) {
    const speaker = entry.role === 'user' ? 'You' : 'CISSP Buddy';
    lines.push(`${speaker}  ${normalizeText(entry.timestamp)}`);

    for (const line of normalizeText(entry.text).split('\n')) {
      lines.push(...wrapLine(line));
    }

    lines.push('');
  }

  return lines;
}

function paginate(lines: readonly string[]): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += BODY_LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + BODY_LINES_PER_PAGE));
  }

  return pages.length > 0 ? pages : [[]];
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPageStream(lines: readonly string[], pageNumber: number, pageCount: number): string {
  const commands: string[] = [
    'BT',
    `/F1 ${FONT_SIZE} Tf`,
    `${LINE_HEIGHT} TL`,
    `1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN} Tm`
  ];

  lines.forEach((line, index) => {
    if (index > 0) {
      commands.push('T*');
    }

    commands.push(`(${escapePdfText(line)}) Tj`);
  });

  commands.push('ET');
  commands.push('BT');
  commands.push(`/F1 ${FOOTER_FONT_SIZE} Tf`);
  commands.push(`1 0 0 1 ${MARGIN} ${MARGIN - 14} Tm`);
  commands.push(`(Page ${pageNumber} of ${pageCount}) Tj`);
  commands.push('ET');

  return commands.join('\n');
}

export function createTranscriptPdf(transcript: readonly TranscriptEntry[]): Uint8Array {
  const pages = paginate(buildTranscriptLines(transcript));
  const objects: string[] = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>';

  const pageObjectNumbers = pages.map((_, pageIndex) => 4 + pageIndex * 2);

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers
    .map((objectNumber) => `${objectNumber} 0 R`)
    .join(' ')}] >>`;

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectNumber = 4 + pageIndex * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const pageStream = buildPageStream(pageLines, pageIndex + 1, pages.length);

    objects[pageObjectNumber] = [
      '<<',
      '/Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
      '/Resources << /Font << /F1 3 0 R >> >>',
      `/Contents ${contentObjectNumber} 0 R`,
      '>>'
    ].join('\n');

    objects[contentObjectNumber] = [
      `<< /Length ${Buffer.byteLength(pageStream, 'utf8')} >>`,
      'stream',
      pageStream,
      'endstream'
    ].join('\n');
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    const objectBody = objects[objectNumber];
    if (!objectBody) {
      continue;
    }

    offsets[objectNumber] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${objectNumber} 0 obj\n${objectBody}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    const offset = offsets[objectNumber] ?? 0;
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += [
    'trailer',
    `<< /Size ${objects.length} /Root 1 0 R >>`,
    'startxref',
    `${xrefStart}`,
    '%%EOF'
  ].join('\n');

  return Buffer.from(pdf, 'utf8');
}
