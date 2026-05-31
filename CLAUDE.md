# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production build
```

No test framework is configured.

## Architecture

Next.js 15 / React 19 app that renders a hardcoded PDF (`/public/sample.pdf`) with word-level click-to-translate floating cards. No TypeScript, no CSS framework — all styling is inline.

**Data flow:**

1. `components/PdfReader.jsx` mounts and calls `extractPdf("/sample.pdf")`
2. `utils/pdf_processor.js` uses pdfjs-dist (worker fetched from cdnjs CDN — requires internet) to extract text items with transform matrix positions; also reads `dc:language` from PDF metadata (falls back to `"en"`)
3. `extractPdf` returns `{ pages, sourceLang }` — `sourceLang` is the BCP-47 primary tag (e.g. `"en"`)
4. Extracted words with absolute `{ x, y }` coordinates are rendered as `position: absolute` spans inside per-page containers
5. On click, `translateWord(word, sourceLang)` POSTs to `/api/translate`, which proxies to the free MyMemory API (`api.mymemory.translated.net`) with `langpair=sourceLang|ru` — no API key, falls back to original text on error

**PDF extraction pipeline** (`utils/pdf_processor.js`):
- `groupByY(items, tolerance=2.5)` — clusters text items into lines using `transform[5]` (Y)
- `detectColumns(lines)` — splits lines into left/right columns by comparing each line's avg `transform[4]` (X) to the median X across all items; returns left column first
- `buildWords(line, pageHeight)` — reconstructs words by sorting items by X and merging items whose gap ≤ `max(2, avgCharWidth * 0.7)`; larger gaps emit a new word. Tracks `wordStartX/Y` from the **first** item in each word (not the last). Y is flipped: `cssY = pageHeight - pdfY` because PDF Y=0 is at the bottom but CSS `top` counts from the top.
- Before processing, duplicate text items at the same integer-rounded position are filtered out (some PDFs embed the same text twice at identical coordinates).

**State** (all local in `PdfReader`):
- `pages` — `[{ pageNum, width, height, words: [{ text, x, y }] }]`, set once on mount
- `sourceLang` — BCP-47 primary tag read from PDF metadata on mount (e.g. `"en"`), passed to every translation call
- `targetLang` — translation target language code (currently hardcoded `"ru"`); drives the target-lang button label in the sidebar
- `card` — `{ word, translation, cefrLevel, x, y }` or `null`; `translation` is `null` while the API call is in flight (shows "Translating…"); `cefrLevel` is `null` for multi-word selections
- `visiblePages` — `Set<number>` of page numbers currently in (or near) the viewport, maintained by `IntersectionObserver`

**Virtualization:**
- `PageView` is wrapped in `React.memo` — it only re-renders when `isVisible` flips
- A single `IntersectionObserver` (root = scroll container, rootMargin = 300px) tracks which pages are near the viewport; pages outside it render an empty positioned div (correct height, no spans)
- `onWordClick` is `useCallback`-memoized so `PageView` props stay referentially stable, meaning `React.memo` actually skips re-renders when the card opens/closes
- Active word highlight is applied via direct DOM mutation (`activeSpanRef`) rather than React state, so clicking a word doesn't trigger any component re-renders

## Theme

All colors live in `utils/theme.js` as a single `colors` object, **namespaced by feature**:

```js
colors.app.*      // top-level shell
colors.sidebar.*  // fixed left sidebar (background, langGroup pill)
colors.page.*     // per-page container
colors.word.*     // word spans
colors.icon.*     // shared icon tints — default and hover
colors.cefr.*     // CEFR level badge colors keyed by level (A1–C2)
colors.card.*     // translation card
```

When adding a new UI element, add a new namespace rather than mixing tokens into an existing one. Import `colors` wherever styles are needed; never hardcode color values inline.

## CEFR level badges

`utils/cefr.json` — language-namespaced lookup table `{ "en": { word: level } }` (6,863 English words, MIT-licensed CEFR-J dataset). Add other languages by inserting a new top-level key; no fetching is needed at runtime.

`utils/cefr.js` — exports `getCefrLevel(word, lang)`. Returns an A1–C2 string or `null` if the word or language is not in the data. Called at the `setCard` site with `sourceLang`; `cefrLevel: null` is passed for multi-word selections so the badge is simply absent.

## Terminology

- **Book page** — the rectangular area sized to the PDF's natural dimensions where the PDF text content is rendered
- **Book background** — the area surrounding the pages: left/right gutters (when the viewport is wider than the page) and the vertical gaps between pages

## Notes

- `main.jsx` at the project root is an unused draft with broken imports; the active component is `components/PdfReader.jsx`
- The PDF path is hardcoded in `PdfReader`; there is no file upload UI
