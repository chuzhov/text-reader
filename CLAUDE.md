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
node scripts/backfill-cefr.mjs  # One-time: populate cefrLevel on existing Word rows from local cefr.json
```

**Prisma non-interactive caveat:** `prisma migrate dev` requires a TTY and will fail in Claude Code's terminal. Ask the user to run it locally, then run `npx prisma generate` to sync the client after the migration is applied.

No test framework is configured.

**Dev server caveat:** Prisma 7's TypeScript-only ESM client has initialization issues in Next.js dev HMR context — after the first sign-in triggers the `authorize` callback, all NextAuth API routes may 500. Use `npm run build && npm start` for reliable auth testing.

## Architecture

Next.js 15 / React 19 app for reading PDFs with word-level click-to-translate floating cards. Users upload PDFs from their PC or by URL; the most recently opened file is auto-loaded on mount. No TypeScript, no CSS framework — all styling is inline.

**Data flow:**

1. `components/PdfReader.jsx` mounts and fetches `GET /api/files`; if the user has files, calls `extractPdf("/api/files/{id}/content")` for the most recently opened one and restores its saved scroll position
2. `utils/pdf_processor.js` uses pdfjs-dist to extract text items with transform matrix positions; also reads `dc:language` from PDF metadata (falls back to `"en"`). The worker is served from `/pdf.worker.min.js` (copied from `node_modules/pdfjs-dist/build/pdf.worker.min.js` to `public/` by the webpack build hook in `next.config.mjs` — no CDN dependency)
3. `extractPdf` returns `{ pages, sourceLang, outline, title, author }` — `sourceLang` is the BCP-47 primary tag (e.g. `"en"`); `outline` is the resolved PDF bookmark tree (empty array if none); `title` and `author` are strings from PDF XMP/info metadata (`dc:title`/`dc:creator` or `info.Title`/`info.Author`), or `null` if absent
4. Extracted words with absolute `{ x, y }` coordinates are rendered as `position: absolute` spans inside per-page containers
5. On click, `translateWord(word, sourceLang, context)` POSTs to `/api/translate`; the server delegates to the configured provider (default: Claude) with surrounding context spans, falling back to MyMemory on error; returns `{ translations, correctedWord }` — `correctedWord` is the typo-corrected spelling from Claude, or `null`; Claude also returns `isWord: false` for gibberish, causing empty `translations` to be returned

**Translation service settings** (`lib/translation/config.js` — all overridable via env vars):
| Env var | Default | Meaning |
|---|---|---|
| `TRANSLATION_PROVIDER` | `"claude"` | Primary provider (`"claude"` or `"mymemory"`) |
| `TRANSLATION_MODEL` | `"claude-haiku-4-5-20251001"` | Claude model used for translation and CEFR |
| `TRANSLATION_FALLBACK` | `true` | Fall back to MyMemory when Claude fails |
| `CONTEXT_SPAN_WORDS` | `12` | Words collected before/after the clicked word for context |
| `CEFR_FROM_AI` | `true` | Ask Claude for CEFR when the local dict misses |
| `LOG_AI_CALLS` | `true` | Append each AI call to `logs/{userId}.jsonl` |

**Layout:** Two fixed 48px sidebars flank the main scroll area. Left sidebar (`left: 0`) holds reading operations (bookshelf, ToC, settings, user menu). Right sidebar (`right: 0`) holds translation options (source/target language pill). A fixed 48px header (`top: 0, left: 48, right: 48`) sits between the sidebars and shows the book title and author from PDF metadata (falls back to filename; author rendered with `·` separator in muted gray when present). Main scroll area uses `top: 48, left: 48, right: 48`. Both sidebars share `colors.sidebar.*`; use CSS classes `sb-left` / `sb-right` only when their styles diverge.

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
- `targetLang` — translation target language code (currently hardcoded `"ru"`); drives the target-lang button label in the right sidebar
- `card` — `{ word, correctedWord, translation, cefrLevel, x, top, bottom }` or `null`; exactly one of `top`/`bottom` is a number, the other is `null` (CSS `bottom` used when card flips above the word to avoid height-estimation gap); `translation` is `null` while the API call is in flight (shows "Translating…"); `cefrLevel` is `null` for multi-word selections; `correctedWord` is the typo-corrected spelling returned by Claude (or `null` if the word was correct) — used instead of `word` when saving to vocab
- `loadingPos` — `{ x, y }` or `null`; position of the loading spinner while translation is in flight; decoupled from `card`'s `top`/`bottom` (always uses `anchorRect.bottom + 8` as `y`)
- `wordStatus` — `{ inVocab, isActive }` or `null`; fetched in parallel with translation via `GET /api/vocabulary/check` for single-word clicks only; `null` for multi-word selections and while loading
- `starSaving` / `bookSaving` — `true` while the respective vocabulary save API call is in flight; shows a 16px spinner inside the button
- `visiblePages` — `Set<number>` of page numbers currently in (or near) the viewport, maintained by `IntersectionObserver`
- `currentPage` — `number | null`; the page whose top edge is at or above the scroll container top (i.e. the page the user is reading); updated on every scroll event via `computeCurrentPage` which queries `[data-pagenum]` elements directly — kept separate from `visiblePages` because that Set has a 300px rootMargin bias and is only reliable for virtualization, not reading-position tracking
- `pdfPath` — current `/api/files/{id}/content` URL being rendered, or `null` if no file is open
- `bookTitle` — title string from PDF metadata (`dc:title` / `info.Title`), or `null`; shown in the header; falls back to the filename at render time
- `bookAuthor` — author string from PDF metadata (`dc:creator` / `info.Author`), or `null`; rendered with `·` separator after the title when present
- `userFiles` — array of the user's `UserFile` records from the API, sorted by most recently opened
- `filesLoaded` — `false` until the initial `/api/files` fetch completes; gates the empty state render
- `showFilePanel` — whether the file picker panel is open
- `panelWidth` — dynamic width of the file picker panel; calculated on open by measuring each filename with a hidden probe `<span>` at `font-size:12px`; bounded by `window.innerWidth - 56 - 48 - 10 - 8` (left sidebar 48 + gap 8, right sidebar 48, scrollbar 10, gap 8)
- `deviceType` — not state, computed inline on render via `window.matchMedia('(pointer: coarse)')` + `window.innerWidth`; values: `"desktop"` / `"tablet"` / `"mobile"`; used in the file panel to show a matching device icon (monitor / tablet / phone) next to the currently open file; inactive files show a document/page icon
- `fileUrl` / `fileUrlError` / `uploadLoading` — URL input value, last upload error, and in-flight flag for the file panel
- `outline` — resolved PDF bookmark tree (`{ title, pageNum, level, items[] }[]`); empty array if the PDF has no outline; set alongside `pages` on file load
- `showTocPanel` — whether the Table of Contents side panel is open
- `tocPanelWidth` — calculated width of the ToC panel (same probe-span technique and same `window.innerWidth - 56 - 48 - 10 - 8` bound as `panelWidth`); computed when the panel opens
- `tocHovered` — `true` while the mouse is inside the ToC panel; used to keep the panel visible
- `showActiveDictPanel` — whether the Active Dictionary panel is open; when `true`, the scroll container's `overflowY` is set to `"hidden"` to lock book scroll
- `activeDictWords` — `[{ id, word, translation, sourceLang, targetLang }]` loaded from `GET /api/vocabulary/active` each time the panel opens
- `activeDictSourceLangs` / `activeDictTargetLangs` — unique language code arrays derived from the fetched words; passed to `ActiveDictPanel` as selectable filter options
- `activeDictHovered` — hover state for the star sidebar button
- `showGeneralDictPanel` — whether the General Dictionary panel is open; also locks book scroll via `overflowY: "hidden"`
- `generalDictWords` — `[{ id, word, translation, sourceLang, targetLang, cefrLevel, isActive }]` loaded from `GET /api/vocabulary` each time the panel opens; `isActive` is derived server-side by joining against `ActiveWord`
- `generalDictSourceLangs` / `generalDictTargetLangs` — unique language code arrays derived from the fetched words
- `generalDictHovered` — hover state for the General Dictionary sidebar button

**General Dictionary panel** (`components/GeneralDictPanel.jsx`):
- Fixed overlay at `top: 56, left: 56, right: 56`; same position as the Active Dictionary panel (the two panels are mutually exclusive — opening one closes the other)
- Toggled by a book-with-spine SVG button in the left sidebar, below the Active Dictionary star button
- **Language filter row:** source `<select>` + `>` separator + target `<select>`; a `1px` vertical divider; sort toggle pill (calendar icon = date order, A-Z icon = alpha order)
- **Sort modes:** `"alpha"` (default, `localeCompare`) or `"date"` (preserves `addedAt desc` order from API)
- **Alphabet index:** in alpha sort, a sticky row of letter buttons appears below the filter bar; clicking a letter scrolls to the first word starting with that letter via `scrollToLetter` (looks up `[data-letter-anchor="X"]` in the scroll container ref); the first column of each row shows the letter for the first entry of each group, or a small dot for subsequent entries; in date sort the first column shows a row number
- **Word list:** `<table>` with three columns per row — letter/index cell (`width:1`), CEFR badge (fixed `width:48`), and a flex row with: word span (`minWidth: maxWordPx + 8`), action buttons, inline translation
- **Hover actions:** `visibility: hidden/visible` keeps space reserved; on row hover, speaker button (SpeechSynthesis, `utter.lang = selectedSource`) and a three-dots menu button appear
- **Three-dots context menu** (`openMenu` state `{ rowIndex, word, x, y }`): positioned dropdown anchored to the button; positions itself above if insufficient space below; contains "Add to Active Dictionary" (disabled + star filled when already active) and "Remove from Dictionary" (red, hidden when word is already active); clicks outside close the menu via a `mousedown` listener; `menuActionLoading` tracks the in-flight action
- `onRemoveWord(id)` — calls `DELETE /api/vocabulary` + filters local `generalDictWords` state in `PdfReader`
- `onAddToActive(word)` — calls `POST /api/vocabulary/active` + sets `isActive: true` on the matching entry in `generalDictWords`

**Active Dictionary panel** (`components/ActiveDictPanel.jsx`):
- Fixed overlay at `top: 56, left: 56, right: 56`; header background matches `colors.sidebar.background`
- **Language filter row:** source `<select>` + `>` separator + target `<select>`; a `1px` vertical divider; sort toggle pill (calendar icon = date order, A-Z icon = alpha order)
- **Sort:** `"date"` (default, preserves `addedAt desc` order from API) or `"alpha"` (client-side `localeCompare`) — applied via `useMemo` on the filtered list
- **Word list:** `<table>` with three columns per row — index number (muted, right-aligned, `width:1`), CEFR badge (fixed `width:48`), and a flex row containing: word span, action buttons, inline translation
- **Button alignment:** canvas `ctx.measureText` finds the widest word's pixel width; all word spans get `minWidth: maxWordPx + 8` so action buttons land at the same X across all rows
- **Hover actions:** `visibility: hidden/visible` (not `display: none`) keeps button space reserved; on row hover, speaker button (SpeechSynthesis, `utter.lang = selectedSource`) and star-minus button appear
- **Inline removal confirmation:** clicking star-minus sets `pendingRemove` to that row index — the speaker/star-minus pair is replaced by a checkmark and an X button; checkmark calls `onRemoveWord(w.id)` (issues `DELETE /api/vocabulary/active` and filters local state in `PdfReader`); X resets `pendingRemove`; the row stays highlighted via `pendingRemove === i` even without mouse hover
- Both speaker and star-minus SVGs use `strokeWidth="2"`; star-minus has an extra `<line x1="9" y1="12.5" x2="15" y2="12.5"/>` for the minus mark
- **Manual add bar** (5.3.1): filter row layout is `[source select] > [target select] [+ btn] | [sort pill]`; clicking `+` reveals an input row (no lang selects — inherits the filter row's selected langs); ESC or successful save dismisses it
  - `sanitizeAddInput(val)` — allows `\p{L}`, `\p{N}`, space; allows `-` only if at least one letter already precedes it; runs on every `onChange` (covers paste)
  - Submission blocked for < 2 characters; submit button disabled and non-hoverable until threshold met
  - English source: `/^to [^\s]+$/i` strips the `"to "` prefix before saving (e.g. "to receive" → "receive")
  - `onAddWord(word, sourceLang, targetLang)` prop (provided by PdfReader): calls `translateWord` → uses `correctedWord ?? word` as the saved form → resolves CEFR (local dict first, AI fallback) → POSTs to `/api/vocabulary/active` → prepends entry to `activeDictWords` and extends lang filter arrays
  - Claude `isWord` guard: single-word translation prompt now returns `"isWord": true|false`; if `false`, empty translations are returned, `onAddWord` returns `null`, and the input shakes + turns red for 350 ms (`input-shake` keyframe in `globals.css`)
  - State local to `ActiveDictPanel`: `showAddBar`, `addWord`, `addLoading`, `addShake`, `hoveredAddBtn`

**Translation card placement** (`computeCardPos(anchorRect, xAnchor)` helper):
- Horizontal: `x = clamp(e.clientX, 64, window.innerWidth - 280 - 48 - 8)`; the `64` left-clamp guards the left sidebar; the `48` right-offset guards the right sidebar; uses the actual click X (`e.clientX`) for single-word clicks so the card is close to the clicked word, not the span's left edge
- Vertical: if space below `anchorRect.bottom` ≥ 220px → `{ top: anchorRect.bottom + 8, bottom: null }`; otherwise flips above → `{ top: null, bottom: window.innerHeight - anchorRect.top + 8 }`. Using CSS `bottom` (not estimated `top`) pins the card's bottom edge 8px above the word regardless of actual card height
- Card JSX uses `top: card.top ?? 'auto', bottom: card.bottom ?? 'auto'`; `maxHeight: window.innerHeight - 32` + `overflowY: auto` for small viewports

**Translation card vocabulary buttons** (single-word only; both disabled for multi-word selections):
- Book button — adds to general vocab (`POST /api/vocabulary`); highlighted (orange) when `wordStatus.inVocab`; no-op if already saved
- Star button — adds to both general and active vocab (`POST /api/vocabulary/active`); highlighted when `wordStatus.isActive`; pressing star after book also lights up the book
- Both buttons show a 16px spinner (`pdf-spinner` class) while the save is in flight, then switch to the highlighted icon on success
- Both save buttons use `card.correctedWord ?? card.word` as the saved word — preserving typo-corrected spelling
- Speaker button (word → speaker → CEFR badge order) — uses `SpeechSynthesis` API with `utter.lang = sourceLang`; single-word only; calls `speechSynthesis.cancel()` before speaking to interrupt any ongoing speech
- Trailing punctuation (`.,;:!?"'…`) is stripped from the extracted word before translation, CEFR lookup, vocab check, and pronunciation

**Link annotations on PDF pages:**
- Words with `linkPageNum` are rendered in `colors.word.linkColor` with `textDecoration: underline`
- The rightmost word in each link group (`isLinkEnd: true`) renders a small inline SVG icon (external-link style) after the text; clicking the icon calls `onLinkClick(linkPageNum)` which scrolls to that page; clicking the word text still opens the translation card
- Icon direction: if `linkPageNum > page.pageNum` (forward/down) the SVG is rendered with `transform: scaleY(-1)` (arrow pointing down); otherwise `transform: scaleX(-1)` (arrow pointing up-left, mirrored horizontally)

**Table of Contents panel:**
- Shown only when `outline.length > 0`; toggled by a list-icon button in the left sidebar; the left sidebar icon uses `transform: scaleX(-1)` so the short dots (page-number markers) appear on the right, matching real ToC conventions
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
colors.sidebar.*   // shared sidebar settings — both sidebars (background, langGroup pill)
colors.header.*    // top header bar (background, title color, bottom shadow)
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
- `GET /api/vocabulary` — returns `{ words, sourceLangs, targetLangs }`; each word includes `cefrLevel` and `isActive` (joined against `ActiveWord`); ordered by `addedAt` desc
- `POST /api/vocabulary` — upsert a word into the user's vocabulary (general vocab only)
- `DELETE /api/vocabulary` — soft-hide a word from the general vocabulary; body: `{ wordId }`
- `GET /api/vocabulary/check?word=X&sourceLang=Y` — returns `{ inVocab, isActive }` for the current user; filters `isHidden: false` on both tables; called in parallel with translation when a single word is clicked
- `POST /api/vocabulary/active` — upsert word + mark it active (adds to both general and active vocab)
- `DELETE /api/vocabulary/active` — remove a word from active study list
- `GET /api/files` — list user's `UserFile` records sorted by `lastOpenedAt desc, uploadedAt desc`
- `POST /api/files` — upload a PDF; accepts multipart `file` field or JSON `{ url }`; validates PDF magic bytes; saves to `uploads/` at project root; returns the created `UserFile` record
- `GET /api/files/[id]/content` — stream a PDF file from `uploads/` with auth + ownership check
- `PATCH /api/files/[id]/open` — stamp `lastOpenedAt` to now (called when a file is opened)
- `PATCH /api/files/[id]/scroll` — save `scrollOffset` (integer px) without touching `lastOpenedAt`
- `POST /api/cefr` — fetch CEFR level for a word from the AI; body: `{ word, sourceLang }`; returns `{ cefrLevel, source }`; logs the call if a session is present

**Session shape** (extended by JWT callbacks):
```js
session.user.id       // String(user.id)
session.user.visitId  // String(userVisit.id) — created at sign-in
```

## Notes

- `main.jsx` at the project root is an unused draft with broken imports; the active component is `components/PdfReader.jsx`
- `components/PdfReaderWrapper.jsx` wraps `PdfReader` with `next/dynamic` (`ssr: false`) — needed because pdfjs-dist uses browser APIs
