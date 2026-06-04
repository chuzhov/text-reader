# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production build
npx prisma migrate dev   # Apply migrations (does NOT regenerate the client in Prisma 7)
npx prisma generate      # Regenerate client after schema changes — always run after migrate
npx prisma db seed       # Seed test user (testuser@email.com / 12345678)
npx prisma studio        # GUI for the SQLite database
```

**Prisma non-interactive caveat:** `prisma migrate dev` requires a TTY and will fail in Claude Code's terminal. Use `npx prisma db push --accept-data-loss` to sync the schema directly, then `npx prisma generate`. The `--accept-data-loss` flag is needed whenever a column is being dropped.

No test framework is configured.

**Dev server caveat:** Prisma 7's TypeScript-only ESM client has initialization issues in Next.js dev HMR context — after the first sign-in triggers the `authorize` callback, all NextAuth API routes may 500. Use `npm run build && npm start` for reliable auth testing.

## Architecture

Next.js 15 / React 19 app for reading PDFs with word-level click-to-translate floating cards. Users upload PDFs from their PC or by URL; the most recently opened file is auto-loaded on mount. No TypeScript, no CSS framework — all styling is inline.

**Data flow:**

1. `components/PdfReader.jsx` mounts and fetches `GET /api/files`; if the user has files, calls `extractPdf("/api/files/{id}/content")` for the most recently opened one and restores its saved scroll position
2. `utils/pdf_processor.js` uses pdfjs-dist to extract text items with transform matrix positions; also reads `dc:language` from PDF metadata (falls back to `"en"`). The worker is served from `/pdf.worker.min.js` (copied from `node_modules/pdfjs-dist/build/pdf.worker.min.js` to `public/` by the webpack build hook in `next.config.mjs` — no CDN dependency)
3. `extractPdf` returns `{ pages, sourceLang, outline }` — `sourceLang` is the BCP-47 primary tag (e.g. `"en"`); `outline` is the resolved PDF bookmark tree (empty array if none)
4. Extracted words with absolute `{ x, y }` coordinates are rendered as `position: absolute` spans inside per-page containers
5. On click, `translateWord(word, sourceLang)` POSTs to `/api/translate`, which proxies to the free MyMemory API (`api.mymemory.translated.net`) with `langpair=sourceLang|ru` — no API key, falls back to original text on error

**File storage:** Uploaded files are saved to `uploads/` at the project root (outside `public/`) and served via the authenticated `GET /api/files/[id]/content` route. Files must **not** be stored in `public/` — Next.js production only serves static files that existed at build time; dynamically-added files in `public/` return 404. The `uploads/` directory is in `.gitignore`.

**PDF extraction pipeline** (`utils/pdf_processor.js`):
- `groupByY(items, tolerance=2.5)` — clusters text items into lines using `transform[5]` (Y)
- `detectColumns(lines)` — splits lines into left/right columns by comparing each line's avg `transform[4]` (X) to the median X across all items; returns left column first
- `buildWords(line, pageHeight)` — reconstructs words by sorting items by X and merging items whose gap ≤ `max(2, avgCharWidth * 0.7)`; larger gaps emit a new word. Tracks `wordStartX/Y` from the **first** item in each word (not the last). Y is flipped: `cssY = pageHeight - pdfY` because PDF Y=0 is at the bottom but CSS `top` counts from the top.
- Before processing, duplicate text items at the same integer-rounded position are filtered out (some PDFs embed the same text twice at identical coordinates).
- `extractOutline(pdf)` — reads `pdf.getOutline()` and recursively resolves each entry's `dest` (named string or raw array) via `pdf.getDestination` + `pdf.getPageIndex` to produce `{ title, pageNum, level, items[] }`. Returns `[]` if the PDF has no outline.
- After `buildWords`, each page's annotations are fetched via `page.getAnnotations()`; `Link`-type annotations with a resolvable `dest` tag matching words by coordinate overlap (`pdfY = pageHeight - word.y` vs `ann.rect [llx, lly, urx, ury]`). Tagged words get `linkPageNum: targetPage`; the rightmost word in each link group gets `isLinkEnd: true` (one icon per link).

**State** (all local in `PdfReader`):
- `pages` — `[{ pageNum, width, height, words: [{ text, x, y, fontSize?, linkPageNum?, isLinkEnd? }] }]`, set once per file load; `linkPageNum` and `isLinkEnd` are present only on words that fall inside a PDF link annotation
- `sourceLang` — BCP-47 primary tag read from PDF metadata on load (e.g. `"en"`), passed to every translation call
- `targetLang` — translation target language code (currently hardcoded `"ru"`); drives the target-lang button label in the sidebar
- `card` — `{ word, translation, cefrLevel, x, top, bottom }` or `null`; exactly one of `top`/`bottom` is a number, the other is `null` (CSS `bottom` used when card flips above the word to avoid height-estimation gap); `translation` is `null` while the API call is in flight (shows "Translating…"); `cefrLevel` is `null` for multi-word selections
- `loadingPos` — `{ x, y }` or `null`; position of the loading spinner while translation is in flight; decoupled from `card`'s `top`/`bottom` (always uses `anchorRect.bottom + 8` as `y`)
- `wordStatus` — `{ inVocab, isActive }` or `null`; fetched in parallel with translation via `GET /api/vocabulary/check` for single-word clicks only; `null` for multi-word selections and while loading
- `starSaving` / `bookSaving` — `true` while the respective vocabulary save API call is in flight; shows a 16px spinner inside the button
- `visiblePages` — `Set<number>` of page numbers currently in (or near) the viewport, maintained by `IntersectionObserver`
- `currentPage` — `number | null`; the page whose top edge is at or above the scroll container top (i.e. the page the user is reading); updated on every scroll event via `computeCurrentPage` which queries `[data-pagenum]` elements directly — kept separate from `visiblePages` because that Set has a 300px rootMargin bias and is only reliable for virtualization, not reading-position tracking
- `pdfPath` — current `/api/files/{id}/content` URL being rendered, or `null` if no file is open
- `userFiles` — array of the user's `UserFile` records from the API, sorted by most recently opened
- `filesLoaded` — `false` until the initial `/api/files` fetch completes; gates the empty state render
- `showFilePanel` — whether the file picker panel is open
- `panelWidth` — dynamic width of the file picker panel; calculated on open by measuring each filename with a hidden probe `<span>` at `font-size:12px`; bounded by `window.innerWidth - 56 - 10 - 8` (sidebar + scrollbar + gap)
- `deviceType` — not state, computed inline on render via `window.matchMedia('(pointer: coarse)')` + `window.innerWidth`; values: `"desktop"` / `"tablet"` / `"mobile"`; used in the file panel to show a matching device icon (monitor / tablet / phone) next to the currently open file; inactive files show a document/page icon
- `fileUrl` / `fileUrlError` / `uploadLoading` — URL input value, last upload error, and in-flight flag for the file panel
- `outline` — resolved PDF bookmark tree (`{ title, pageNum, level, items[] }[]`); empty array if the PDF has no outline; set alongside `pages` on file load
- `showTocPanel` — whether the Table of Contents side panel is open
- `tocPanelWidth` — calculated width of the ToC panel (same probe-span technique as `panelWidth`); computed when the panel opens
- `tocHovered` — `true` while the mouse is inside the ToC panel; used to keep the panel visible

**Translation card placement** (`computeCardPos(anchorRect, xAnchor)` helper):
- Horizontal: `x = clamp(e.clientX, 64, window.innerWidth - 280 - 8)`; uses the actual click X (`e.clientX`) for single-word clicks so the card is close to the clicked word, not the span's left edge
- Vertical: if space below `anchorRect.bottom` ≥ 220px → `{ top: anchorRect.bottom + 8, bottom: null }`; otherwise flips above → `{ top: null, bottom: window.innerHeight - anchorRect.top + 8 }`. Using CSS `bottom` (not estimated `top`) pins the card's bottom edge 8px above the word regardless of actual card height
- Card JSX uses `top: card.top ?? 'auto', bottom: card.bottom ?? 'auto'`; `maxHeight: window.innerHeight - 32` + `overflowY: auto` for small viewports

**Translation card vocabulary buttons** (single-word only; both disabled for multi-word selections):
- Book button — adds to general vocab (`POST /api/vocabulary`); highlighted (orange) when `wordStatus.inVocab`; no-op if already saved
- Star button — adds to both general and active vocab (`POST /api/vocabulary/active`); highlighted when `wordStatus.isActive`; pressing star after book also lights up the book
- Both buttons show a 16px spinner (`pdf-spinner` class) while the save is in flight, then switch to the highlighted icon on success
- Speaker button (word → speaker → CEFR badge order) — uses `SpeechSynthesis` API with `utter.lang = sourceLang`; single-word only; calls `speechSynthesis.cancel()` before speaking to interrupt any ongoing speech
- Trailing punctuation (`.,;:!?"'…`) is stripped from the extracted word before translation, CEFR lookup, vocab check, and pronunciation

**Link annotations on PDF pages:**
- Words with `linkPageNum` are rendered in `colors.word.linkColor` with `textDecoration: underline`
- The rightmost word in each link group (`isLinkEnd: true`) renders a small inline SVG icon (external-link style) after the text; clicking the icon calls `onLinkClick(linkPageNum)` which scrolls to that page; clicking the word text still opens the translation card
- Icon direction: if `linkPageNum > page.pageNum` (forward/down) the SVG is rendered with `transform: scaleY(-1)` (arrow pointing down); otherwise `transform: scaleX(-1)` (arrow pointing up-left, mirrored horizontally)

**Table of Contents panel:**
- Shown only when `outline.length > 0`; toggled by a list-icon button in the sidebar; the sidebar icon uses `transform: scaleX(-1)` so the short dots (page-number markers) appear on the right, matching real ToC conventions
- `flattenOutline(items)` recursively flattens the tree to a list with `level` preserved for indentation (`paddingLeft: 8 + level * 12`)
- Each row is a `button.toc-row` (CSS in `globals.css`) showing the title (truncated) and page number; clicking scrolls to that page via `scrollToPage`
- `scrollToPage` is `useCallback`-memoized; passed as `onLinkClick` to `PageView`
- Active rows: at render time `activePage` is computed as the highest `pageNum ≤ currentPage` among all flattened items; every item whose `pageNum === activePage` receives the `toc-row-active` class, which applies an orange left accent (`box-shadow: inset 3px 0 0 #F97316`) without affecting layout. Multiple items can be active simultaneously when a PDF page contains several outline entries.

**Virtualization:**
- `PageView` is wrapped in `React.memo` — it only re-renders when `isVisible` flips
- A single `IntersectionObserver` (root = scroll container, rootMargin = 300px) tracks which pages are near the viewport; pages outside it render an empty positioned div (correct height, no spans)
- `onWordClick` is `useCallback`-memoized so `PageView` props stay referentially stable, meaning `React.memo` actually skips re-renders when the card opens/closes
- Active word highlight is applied via direct DOM mutation (`activeSpanRef`) rather than React state, so clicking a word doesn't trigger any component re-renders

## Theme

All colors live in `utils/theme.js` as a single `colors` object, **namespaced by feature**:

```js
colors.app.*       // top-level shell
colors.sidebar.*   // fixed left sidebar (background, langGroup pill)
colors.page.*      // per-page container
colors.word.*      // word spans — includes linkColor for PDF link annotations
colors.icon.*      // shared icon tints — default and hover
colors.cefr.*      // CEFR level badge colors keyed by level (A1–C2)
colors.card.*      // translation card
colors.filePanel.* // file picker panel (upload button, URL input, recent file list items)
```

When adding a new UI element, add a new namespace rather than mixing tokens into an existing one. Import `colors` wherever styles are needed; never hardcode color values inline.

## CEFR level badges

`utils/cefr.json` — language-namespaced lookup table `{ "en": { word: level } }` (6,863 English words, MIT-licensed CEFR-J dataset). Add other languages by inserting a new top-level key; no fetching is needed at runtime.

`utils/cefr.js` — exports `getCefrLevel(word, lang)`. Returns an A1–C2 string or `null` if the word or language is not in the data. Called at the `setCard` site with `sourceLang`; `cefrLevel: null` is passed for multi-word selections so the badge is simply absent.

## Terminology

- **Book page** — the rectangular area sized to the PDF's natural dimensions where the PDF text content is rendered
- **Book background** — the area surrounding the pages: left/right gutters (when the viewport is wider than the page) and the vertical gaps between pages

## Auth & database

**Authentication:** NextAuth v4 with a Credentials provider (`lib/auth.js`). Custom sign-in page at `/auth` (`app/auth/page.jsx`). Session strategy is JWT. The `jwt` and `session` callbacks extend the token with `id` (user row ID) and `visitId` (current `UserVisit` row ID — created on every sign-in).

**Middleware** (`middleware.js`): re-exports `next-auth/middleware`; protects every route except `/auth`, `/api/auth/*`, and Next.js static assets.

**Database:** SQLite (`prisma/dev.db`) via Prisma 7 with the LibSQL adapter (`@prisma/adapter-libsql`). Client generated to `app/generated/prisma/` as TypeScript-only ESM. Webpack `extensionAlias` in `next.config.mjs` maps `.js` → `.ts` so generated deep imports resolve. Singleton in `lib/prisma.js` — stored on `globalThis` in dev mode to survive HMR.

**Prisma 7 quirk:** `prisma migrate dev` applies the migration but does **not** regenerate the client automatically. Always follow it with `npx prisma generate`, otherwise the runtime client will be out of sync with the schema (missing new models/fields).

**Schema models:**
- `User` — email + bcrypt-hashed password; owns `UserSettings`, `Word`, `ActiveWord`, `UserVisit`, `UserFile`
- `UserSettings` — per-user `sourceLang`/`targetLang` defaults (created with user on registration)
- `Word` — saved vocabulary entries; unique on `(userId, word, sourceLang)`; `isHidden Boolean @default(false)` for soft-hiding words
- `ActiveWord` — words currently being studied; unique on `(userId, wordId)`; `isHidden Boolean @default(false)`; only `isHidden: false` records are counted when checking active status in the translation card
- `UserVisit` — one row per sign-in; `lastVisitedAt` stamped on word click and logout via `POST /api/visit/ping`
- `UserFile` — uploaded PDF metadata; `path` stores only the filename (not a URL); `scrollOffset` (int px) is restored when the file is reopened; `lastOpenedAt` drives the "most recent" sort order

**API routes** (all require a valid session except `/api/auth/*`):
- `POST /api/auth/register` — create account; hashes password with bcrypt, creates default `UserSettings`
- `POST /api/visit/ping` — updates `lastVisitedAt` for the current visit using `session.user.visitId`
- `GET /api/vocabulary` — list user's saved words ordered by `addedAt` desc
- `POST /api/vocabulary` — upsert a word into the user's vocabulary (general vocab only)
- `GET /api/vocabulary/check?word=X&sourceLang=Y` — returns `{ inVocab, isActive }` for the current user; filters `isHidden: false` on both tables; called in parallel with translation when a single word is clicked
- `POST /api/vocabulary/active` — upsert word + mark it active (adds to both general and active vocab)
- `DELETE /api/vocabulary/active` — remove a word from active study list
- `GET /api/files` — list user's `UserFile` records sorted by `lastOpenedAt desc, uploadedAt desc`
- `POST /api/files` — upload a PDF; accepts multipart `file` field or JSON `{ url }`; validates PDF magic bytes; saves to `uploads/` at project root; returns the created `UserFile` record
- `GET /api/files/[id]/content` — stream a PDF file from `uploads/` with auth + ownership check
- `PATCH /api/files/[id]/open` — stamp `lastOpenedAt` to now (called when a file is opened)
- `PATCH /api/files/[id]/scroll` — save `scrollOffset` (integer px) without touching `lastOpenedAt`

**Session shape** (extended by JWT callbacks):
```js
session.user.id       // String(user.id)
session.user.visitId  // String(userVisit.id) — created at sign-in
```

## Notes

- `main.jsx` at the project root is an unused draft with broken imports; the active component is `components/PdfReader.jsx`
- `components/PdfReaderWrapper.jsx` wraps `PdfReader` with `next/dynamic` (`ssr: false`) — needed because pdfjs-dist uses browser APIs
