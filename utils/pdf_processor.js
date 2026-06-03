import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

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
  let wordFontSize = Math.abs(current.transform[3]);

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
        fontSize: wordFontSize,
      });

      buffer = item.str;
      wordStartX = item.transform[4];
      wordStartY = pageHeight - item.transform[5];
      wordFontSize = Math.abs(item.transform[3]);
    }

    current = item;
  }

  words.push({
    text: buffer,
    x: wordStartX,
    y: wordStartY,
    fontSize: wordFontSize,
  });

  return words;
}

async function extractOutline(pdf) {
  const raw = await pdf.getOutline().catch(() => null);
  if (!raw || raw.length === 0) return [];

  async function resolve(items, level) {
    const result = [];
    for (const item of items) {
      let pageNum = null;
      try {
        let dest = item.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) {
          pageNum = (await pdf.getPageIndex(dest[0])) + 1;
        }
      } catch {}
      result.push({
        title: item.title,
        pageNum,
        level,
        items: item.items?.length ? await resolve(item.items, level + 1) : [],
      });
    }
    return result;
  }

  return resolve(raw, 0);
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

    // Tag words that fall inside a PDF link annotation pointing to another page
    const annotations = await page.getAnnotations();
    for (const ann of annotations) {
      if (ann.subtype !== 'Link') continue;
      const rawDest = ann.dest ?? ann.action?.dest;
      if (!rawDest) continue;
      let dest = rawDest;
      if (typeof dest === 'string') {
        try { dest = await pdf.getDestination(dest); } catch { continue; }
      }
      if (!Array.isArray(dest) || !dest[0]) continue;
      let targetPage;
      try { targetPage = (await pdf.getPageIndex(dest[0])) + 1; } catch { continue; }
      const [llx, lly, urx, ury] = ann.rect;
      for (const word of words) {
        const pdfY = pageHeight - word.y;
        if (word.x >= llx - 2 && word.x <= urx + 2 && pdfY >= lly - 2 && pdfY <= ury + 2) {
          word.linkPageNum = targetPage;
        }
      }
    }
    // Mark the first word of each consecutive run of same-destination links.
    // Sort by reading order (top→bottom, left→right) because PDF content stream
    // order doesn't match visual order — subtitle may appear before title in stream.
    const byReadingOrder = [...words].sort((a, b) =>
      a.y !== b.y ? a.y - b.y : a.x - b.x
    );
    for (let i = 0; i < byReadingOrder.length; i++) {
      const w = byReadingOrder[i];
      if (w.linkPageNum == null) continue;
      const prev = byReadingOrder[i - 1];
      if (!prev || prev.linkPageNum !== w.linkPageNum) {
        w.isLinkIcon = true;
      }
    }

    pages.push({
      pageNum,
      width: pageWidth,
      height: pageHeight,
      words,
    });
  }

  const outline = await extractOutline(pdf);
  return { pages, sourceLang, outline };
}