import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function groupByY(items, tolerance = 2.5) {
  const lines = [];

  for (const item of items) {
    const y = item.transform[5];

    let line = lines.find(l => Math.abs(l.y - y) < tolerance);

    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }

    line.items.push(item);
  }

  return lines;
}

/**
 * COLUMN DETECTION (key production feature)
 */
function detectColumns(lines) {
  const xs = lines.flatMap(l =>
    l.items.map(i => i.transform[4])
  );

  const medianX = xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  const left = [];
  const right = [];

  lines.forEach(line => {
    const avgX =
      line.items.reduce((s, i) => s + i.transform[4], 0) /
      line.items.length;

    if (avgX < medianX) left.push(line);
    else right.push(line);
  });

  return [...left, ...right];
}

/**
 * WORD RECONSTRUCTION
 */
function buildWords(line, pageHeight) {
  const items = [...line.items].sort(
    (a, b) => a.transform[4] - b.transform[4]
  );

  const words = [];

  let current = items[0];
  let buffer = current.str;
  let wordStartX = current.transform[4];
  let wordStartY = pageHeight - current.transform[5];

  for (let i = 1; i < items.length; i++) {
    const item = items[i];

    const gap =
      item.transform[4] -
      (current.transform[4] + (current.width || 0));

    const avgCharWidth =
      (current.width || 10) / (current.str.length || 1);

    const threshold = Math.max(2, avgCharWidth * 0.7);

    if (gap <= threshold) {
      buffer += item.str;
    } else {
      words.push({
        text: buffer,
        x: wordStartX,
        y: wordStartY,
      });

      buffer = item.str;
      wordStartX = item.transform[4];
      wordStartY = pageHeight - item.transform[5];
    }

    current = item;
  }

  words.push({
    text: buffer,
    x: wordStartX,
    y: wordStartY,
  });

  return words;
}

/**
 * MAIN EXTRACTION PIPELINE
 */
export async function extractPdf(pdfUrl) {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;

  const meta = await pdf.getMetadata().catch(() => ({}));
  const rawLang =
    meta.metadata?.getAll?.()?.['dc:language'] ??
    meta.info?.Language ??
    'en';
  const sourceLang = rawLang.split('-')[0].toLowerCase() || 'en';

  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    const textContent = await page.getTextContent();

    const seen = new Set();
    const uniqueItems = textContent.items.filter(item => {
      const key = `${item.str}|${Math.round(item.transform[4])}|${Math.round(item.transform[5])}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let lines = groupByY(uniqueItems);
    lines = detectColumns(lines);

    const words = lines.flatMap(line => buildWords(line, pageHeight));

    pages.push({
      pageNum,
      width: pageWidth,
      height: pageHeight,
      words,
    });
  }

  return { pages, sourceLang };
}