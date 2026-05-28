// Run: node scripts/inspect-pdf.js [pageNum]
// Dumps all raw pdfjs-dist data for a given page (default: 1) of public/sample.pdf

const path = require('path');
const fs = require('fs');

const pdfjsLib = require('../node_modules/pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = false;

function sep(label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(60));
}

async function main() {
  const targetPage = parseInt(process.argv[2] ?? '1', 10);

  const pdfPath = path.join(__dirname, '..', 'public', 'sample.pdf');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  sep('PDF OVERVIEW');
  console.log('numPages   :', pdf.numPages);
  console.log('fingerprint:', pdf.fingerprints?.join(', '));

  sep('METADATA');
  const meta = await pdf.getMetadata().catch(() => ({}));
  console.log('--- info ---');
  console.log(JSON.stringify(meta.info ?? {}, null, 2));
  console.log('--- metadata (dc:*, xmp:*, etc.) ---');
  const allMeta = meta.metadata?.getAll?.() ?? null;
  console.log(JSON.stringify(allMeta, null, 2));

  // Quick scan: show item counts for the first 20 pages so you can pick a useful target
  sep('ITEM COUNT SUMMARY (first 20 pages)');
  const scanLimit = Math.min(20, pdf.numPages);
  for (let p = 1; p <= scanLimit; p++) {
    const pg = await pdf.getPage(p);
    const tc = await pg.getTextContent();
    const marker = p === targetPage ? ' <-- target' : '';
    console.log(`  page ${String(p).padStart(3)}: ${tc.items.length} items${marker}`);
  }

  sep(`PAGE ${targetPage} — VIEWPORT`);
  const page = await pdf.getPage(targetPage);
  const vp = page.getViewport({ scale: 1 });
  console.log('width      :', vp.width);
  console.log('height     :', vp.height);
  console.log('viewBox    :', vp.viewBox);
  console.log('rotation   :', vp.rotation);
  console.log('scale      :', vp.scale);

  sep(`PAGE ${targetPage} — ANNOTATIONS`);
  const annotations = await page.getAnnotations();
  console.log(`count: ${annotations.length}`);
  annotations.forEach((a, i) => {
    console.log(`[${i}]`, JSON.stringify(a, null, 2));
  });

  sep(`PAGE ${targetPage} — RAW TEXT ITEMS`);
  const textContent = await page.getTextContent();
  console.log(`total items : ${textContent.items.length}`);
  console.log(`styles keys : ${Object.keys(textContent.styles ?? {}).join(', ')}`);

  console.log('\n--- items ---');
  textContent.items.forEach((item, i) => {
    // transform: [scaleX, skewX, skewY, scaleY, x, y]
    const [sx, , , sy, x, y] = item.transform ?? [];
    console.log(
      `[${String(i).padStart(3, '0')}]` +
      `  str=${JSON.stringify(item.str)}` +
      `  x=${String(Math.round(x)).padStart(6)}  y=${String(Math.round(y)).padStart(6)}` +
      `  w=${String(Math.round(item.width ?? 0)).padStart(5)}  h=${String(Math.round(item.height ?? 0)).padStart(4)}` +
      `  font=${item.fontName}` +
      `  dir=${item.dir}` +
      `  eol=${item.hasEOL}` +
      `  scale=[${sx?.toFixed(2)},${sy?.toFixed(2)}]`
    );
  });

  console.log('\n--- styles ---');
  for (const [name, style] of Object.entries(textContent.styles ?? {})) {
    console.log(`${name}:`, JSON.stringify(style));
  }

  sep(`PAGE ${targetPage} — OPERATOR LIST (raw PDF render ops)`);
  // Build reverse map: opCode (number) -> opName (string)
  const opNames = Object.fromEntries(
    Object.entries(pdfjsLib.OPS).map(([name, code]) => [code, name])
  );

  const opList = await page.getOperatorList();
  console.log(`total ops: ${opList.fnArray.length}`);
  opList.fnArray.forEach((fn, i) => {
    const args = opList.argsArray[i];
    const name = opNames[fn] ?? `op_${fn}`;
    // Truncate large binary args (e.g. image data) so they don't flood the terminal
    const argsStr = args == null ? '' : JSON.stringify(
      args,
      (_, v) => (v instanceof Uint8Array || v instanceof Uint8ClampedArray)
        ? `<Uint8Array len=${v.length}>`
        : v
    ).slice(0, 120);
    console.log(`[${String(i).padStart(4, '0')}]  ${name.padEnd(28)} ${argsStr}`);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
