'use client';

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { extractPdf } from "@/utils/pdf_processor";
import { translateWord } from "@/utils/translation_api";
import { getCefrLevel } from "@/utils/cefr";
import { colors } from "@/utils/theme";

function getSelectedText() {
  return window.getSelection()?.toString().trim() || '';
}

function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).getBoundingClientRect();
}

function getWordAtPoint(x, y, fallback) {
  let node, offset;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) { node = range.startContainer; offset = range.startOffset; }
  }
  if (node?.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    let start = offset;
    let end = offset;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    while (end < text.length && /\S/.test(text[end])) end++;
    const word = text.slice(start, end).trim();
    if (word) return word;
  }
  return fallback;
}

// Returns { x, top, bottom } — exactly one of top/bottom is a number, the other is null.
// Using CSS bottom when flipping above avoids needing to know the card's actual height.
function computeCardPos(anchorRect, xAnchor) {
  const CARD_W = 280;
  const CARD_H = 220;
  const x = Math.max(64, Math.min(window.innerWidth - CARD_W - 8, xAnchor ?? anchorRect.left));
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
  if (spaceBelow >= CARD_H) {
    return { x, top: anchorRect.bottom + 8, bottom: null };
  }
  return { x, top: null, bottom: window.innerHeight - anchorRect.top + 8 };
}

// Memoized — only re-renders when isVisible flips or page data changes
const PageView = React.memo(function PageView({ page, isVisible, onWordClick }) {
  return (
    <div style={{ background: colors.page.background }}>
      <div style={{ fontSize: 12, color: colors.page.label, padding: "4px 8px" }}>
        Page {page.pageNum}
      </div>
      <div style={{ position: "relative", width: page.width, height: page.height }}>
        {isVisible && page.words.map((w, i) => (
          <span
            key={i}
            onClick={onWordClick}
            style={{
              position: "absolute",
              left: w.x,
              top: w.y,
              fontSize: w.fontSize,
              lineHeight: 1,
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: colors.word.background,
              padding: "1px 3px",
              borderRadius: 3,
            }}
          >
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
});

export default function PdfReader() {
  const { data: session } = useSession();
  const userInitial = session?.user?.email?.[0]?.toUpperCase() ?? '?';

  const [pages, setPages] = useState([]);
  const [sourceLang, setSourceLang] = useState("en");
  const [card, setCard] = useState(null);
  const [loadingPos, setLoadingPos] = useState(null);
  const [visiblePages, setVisiblePages] = useState(new Set());
  const [targetLang] = useState("ru");

  const deviceType = (() => {
    if (typeof window === 'undefined') return 'desktop';
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (!isTouch) return 'desktop';
    return window.innerWidth < 768 ? 'mobile' : 'tablet';
  })();

  // File management
  const [pdfPath, setPdfPath] = useState(null);
  const [userFiles, setUserFiles] = useState([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [panelWidth, setPanelWidth] = useState(284);
  const [wordStatus, setWordStatus] = useState(null); // { inVocab, isActive } | null
  const [starSaving, setStarSaving] = useState(false);
  const [bookSaving, setBookSaving] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [fileUrlError, setFileUrlError] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Hover states
  const [bookshelfHovered, setBookshelfHovered] = useState(false);
  const [starHovered, setStarHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [bookHovered, setBookHovered] = useState(false);
  const [sourceLangHovered, setSourceLangHovered] = useState(false);
  const [targetLangHovered, setTargetLangHovered] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutHovered, setLogoutHovered] = useState(false);
  const [speakerHovered, setSpeakerHovered] = useState(false);

  const containerRef = useRef(null);
  const userMenuRef = useRef(null);
  const filePanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const observerRef = useRef(null);
  const activeSpanRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const currentFileIdRef = useRef(null);
  const scrollSaveTimerRef = useRef(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handleOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [userMenuOpen]);

  // Close file panel on outside click
  useEffect(() => {
    if (!showFilePanel) return;
    const handleOutside = (e) => {
      if (filePanelRef.current && !filePanelRef.current.contains(e.target)) {
        setShowFilePanel(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showFilePanel]);

  // Resize panel to fit the longest filename, up to the available viewport width
  useEffect(() => {
    if (!showFilePanel) return;
    function calcWidth() {
      // scrollbar = 10px (matches .pdf-scroll-container::-webkit-scrollbar width)
      // left edge of panel = 56px (sidebar 48 + gap 8), right gap = 8px
      const maxWidth = window.innerWidth - 56 - 10 - 8;
      let needed = 284;
      if (userFiles.length > 0) {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;white-space:nowrap;font-size:12px';
        document.body.appendChild(probe);
        let maxTextW = 0;
        for (const f of userFiles) {
          probe.textContent = f.name;
          const w = probe.getBoundingClientRect().width;
          if (w > maxTextW) maxTextW = w;
        }
        document.body.removeChild(probe);
        // row: 14px left-pad + 14px icon + 8px gap + text + 8px breathing room + 23px trash (icon 13 + padding-right 10)
        needed = Math.max(284, Math.ceil(14 + 14 + 8 + maxTextW + 8 + 23));
      }
      setPanelWidth(Math.min(needed, maxWidth));
    }
    calcWidth();
    window.addEventListener('resize', calcWidth);
    return () => window.removeEventListener('resize', calcWidth);
  }, [showFilePanel, userFiles]);

  // Load most recent file on mount
  useEffect(() => {
    fetch('/api/files')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ files }) => {
        const list = files || [];
        setUserFiles(list);
        setFilesLoaded(true);
        if (list.length > 0) {
          loadFile(`/api/files/${list[0].id}/content`, list[0].id, list[0].scrollOffset);
        }
      })
      .catch(() => setFilesLoaded(true));
  }, []);

  // Restore scroll position after pages render
  useEffect(() => {
    if (pages.length > 0 && pendingScrollRef.current !== null) {
      containerRef.current?.scrollTo({ top: pendingScrollRef.current });
      pendingScrollRef.current = null;
    }
  }, [pages]);

  // Single IntersectionObserver for all pages
  useEffect(() => {
    if (!containerRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages(prev => {
          const next = new Set(prev);
          let changed = false;
          entries.forEach(entry => {
            const pageNum = Number(entry.target.dataset.pagenum);
            if (entry.isIntersecting && !next.has(pageNum)) {
              next.add(pageNum); changed = true;
            } else if (!entry.isIntersecting && next.has(pageNum)) {
              next.delete(pageNum); changed = true;
            }
          });
          return changed ? next : prev;
        });
      },
      { root: containerRef.current, rootMargin: "300px 0px" }
    );
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeCard(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!containerRef.current || (!card && !loadingPos)) return;
    const el = containerRef.current;
    const prevent = (e) => e.preventDefault();
    el.addEventListener("wheel", prevent, { passive: false });
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      el.removeEventListener("wheel", prevent);
      el.removeEventListener("touchmove", prevent);
    };
  }, [card, loadingPos]);

  // Callback ref — registers each page wrapper with the observer
  const pageRef = useCallback((el) => {
    if (el && observerRef.current) observerRef.current.observe(el);
  }, []);

  async function loadFile(filePath, fileId, scrollOffset = 0) {
    setPdfPath(filePath);
    setPages([]);
    setShowFilePanel(false);
    pendingScrollRef.current = scrollOffset;
    currentFileIdRef.current = fileId;
    const { pages: p, sourceLang: sl } = await extractPdf(filePath);
    setPages(p);
    setSourceLang(sl);
    if (fileId) {
      fetch(`/api/files/${fileId}/open`, { method: 'PATCH' });
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body: formData });
    const data = await res.json();
    setUploadLoading(false);
    if (data.file) {
      setUserFiles(prev => [data.file, ...prev.filter(f => f.id !== data.file.id)]);
      loadFile(`/api/files/${data.file.id}/content`, data.file.id, 0);
    }
  }

  async function handleUrlLoad() {
    const url = fileUrl.trim();
    if (!url) return;
    setUploadLoading(true);
    setFileUrlError(null);
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    setUploadLoading(false);
    if (data.file) {
      setFileUrl('');
      setUserFiles(prev => [data.file, ...prev.filter(f => f.id !== data.file.id)]);
      loadFile(`/api/files/${data.file.id}/content`, data.file.id, 0);
    } else {
      setFileUrlError(data.error || 'Failed to load URL');
    }
  }

  function handleCloseFile(e) {
    e.stopPropagation();
    setPdfPath(null);
    setPages([]);
    currentFileIdRef.current = null;
    setShowFilePanel(false);
  }

  async function handleDeleteFile(e, fileId) {
    e.stopPropagation();
    await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
    setUserFiles(prev => prev.filter(f => f.id !== fileId));
    if (currentFileIdRef.current === fileId) {
      setPdfPath(null);
      setPages([]);
      currentFileIdRef.current = null;
    }
  }

  // Debounced scroll offset save — fires 1 s after last scroll event
  const handleScroll = useCallback(() => {
    if (!currentFileIdRef.current) return;
    clearTimeout(scrollSaveTimerRef.current);
    scrollSaveTimerRef.current = setTimeout(() => {
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      fetch(`/api/files/${currentFileIdRef.current}/scroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollOffset: Math.round(scrollTop) }),
      });
    }, 1000);
  }, []);

  function closeCard() {
    if (activeSpanRef.current) {
      activeSpanRef.current.style.background = colors.word.background;
      activeSpanRef.current = null;
    }
    setCard(null);
    setLoadingPos(null);
    setWordStatus(null);
    setStarSaving(false);
    setBookSaving(false);
    setCloseHovered(false);
    setBookHovered(false);
    setStarHovered(false);
    setSpeakerHovered(false);
  }

  // Stable callback — PageView won't re-render when card opens/closes
  const onWordClick = useCallback(async (e) => {
    e.stopPropagation();
    fetch('/api/visit/ping', { method: 'POST' });

    const selectedText = getSelectedText();
    if (selectedText) {
      const selRect = getSelectionRect();
      window.getSelection().removeAllRanges();
      if (activeSpanRef.current) {
        activeSpanRef.current.style.background = colors.word.background;
        activeSpanRef.current = null;
      }
      const cardPos = computeCardPos(selRect);
      setCard(null);
      setWordStatus(null);
      setLoadingPos({ x: selRect.left, y: selRect.bottom + 8 });
      const translation = await translateWord(selectedText, sourceLang);
      setLoadingPos(null);
      const status = translation && !translation.includes(' ')
        ? await fetch(`/api/vocabulary/check?word=${encodeURIComponent(selectedText)}&sourceLang=${encodeURIComponent(sourceLang)}`).then(r => r.ok ? r.json() : null)
        : null;
      setCard({ word: selectedText, translation, cefrLevel: null, ...cardPos });
      setWordStatus(status);
      return;
    }

    const word = getWordAtPoint(e.clientX, e.clientY, e.currentTarget.textContent).replace(/[.,;:!?"'…]+$/, '');

    if (activeSpanRef.current) {
      activeSpanRef.current.style.background = colors.word.background;
    }
    activeSpanRef.current = e.currentTarget;
    e.currentTarget.style.background = colors.word.activeBackground;

    const rect = e.currentTarget.getBoundingClientRect();
    const cardPos = computeCardPos(rect, e.clientX);
    setCard(null);
    setWordStatus(null);
    setLoadingPos({ x: e.clientX, y: rect.bottom + 8 });

    const isSingle = !word.includes(' ');
    const [translation, status] = await Promise.all([
      translateWord(word, sourceLang),
      isSingle
        ? fetch(`/api/vocabulary/check?word=${encodeURIComponent(word)}&sourceLang=${encodeURIComponent(sourceLang)}`).then(r => r.ok ? r.json() : null)
        : Promise.resolve(null),
    ]);
    setLoadingPos(null);
    setCard({ word, translation, cefrLevel: getCefrLevel(word, sourceLang), ...cardPos });
    setWordStatus(status);
  }, [sourceLang]);

  return (
    <>
    {/* Sidebar */}
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: 48,
        background: colors.sidebar.background,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 8 }}>
        {/* Bookshelf / Open file */}
        <button
          onMouseEnter={() => setBookshelfHovered(true)}
          onMouseLeave={() => setBookshelfHovered(false)}
          onClick={() => setShowFilePanel(v => !v)}
          style={{
            background: showFilePanel ? colors.app.background : "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            borderRadius: 6,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 32 32" fill={bookshelfHovered || showFilePanel ? colors.icon.hover : colors.icon.default}>
            <rect x="4" y="2" width="24" height="28" stroke={colors.icon.default} fill="none" strokeWidth="2"/>
            <line x1="4" y1="10" x2="28" y2="10" stroke={colors.icon.default} strokeWidth="2"/>
            <line x1="4" y1="18" x2="28" y2="18" stroke={colors.icon.default} strokeWidth="2"/>
            <line x1="4" y1="26" x2="28" y2="26" stroke={colors.icon.default} strokeWidth="2"/>
            <rect x="6" y="3" width="3" height="6"/>
            <rect x="10" y="3" width="3" height="6"/>
            <rect x="14" y="3" width="3" height="6"/>
            <rect x="6" y="11" width="3" height="6"/>
            <rect x="10" y="11" width="3" height="6"/>
            <polygon points="16,11 19,11 21,17 18,17"/>
            <rect x="6" y="19" width="3" height="6"/>
            <rect x="10" y="19" width="3" height="6"/>
            <rect x="14" y="19" width="3" height="6"/>
          </svg>
        </button>
        <div style={{
          background: colors.sidebar.langGroup,
          borderRadius: 6,
          padding: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}>
          <button
            onMouseEnter={() => setSourceLangHovered(true)}
            onMouseLeave={() => setSourceLangHovered(false)}
            style={{
              width: 30,
              height: 30,
              background: colors.sidebar.background,
              border: `1px solid ${colors.icon.default}`,
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              color: sourceLangHovered ? colors.icon.hover : colors.icon.default,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {sourceLang[0].toUpperCase() + sourceLang.slice(1)}
          </button>
          <button
            onMouseEnter={() => setTargetLangHovered(true)}
            onMouseLeave={() => setTargetLangHovered(false)}
            style={{
              width: 30,
              height: 30,
              background: colors.sidebar.background,
              border: `1px solid ${colors.icon.default}`,
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              color: targetLangHovered ? colors.icon.hover : colors.icon.default,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {targetLang[0].toUpperCase() + targetLang.slice(1)}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingBottom: 8 }}>
        <button
          onMouseEnter={() => setSettingsHovered(true)}
          onMouseLeave={() => setSettingsHovered(false)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke={settingsHovered ? colors.icon.hover : colors.icon.default} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10">
            <circle cx="16" cy="16" r="4"/>
            <path d="M27.758,10.366l-1-1.732c-0.552-0.957-1.775-1.284-2.732-0.732L23.5,8.206C21.5,9.36,19,7.917,19,5.608V5c0-1.105-0.895-2-2-2h-2c-1.105,0-2,0.895-2,2v0.608c0,2.309-2.5,3.753-4.5,2.598L7.974,7.902C7.017,7.35,5.794,7.677,5.242,8.634l-1,1.732c-0.552,0.957-0.225,2.18,0.732,2.732L5.5,13.402c2,1.155,2,4.041,0,5.196l-0.526,0.304c-0.957,0.552-1.284,1.775-0.732,2.732l1,1.732c0.552,0.957,1.775,1.284,2.732,0.732L8.5,23.794c2-1.155,4.5,0.289,4.5,2.598V27c0,1.105,0.895,2,2,2h2c1.105,0,2-0.895,2-2v-0.608c0-2.309,2.5-3.753,4.5-2.598l0.526,0.304c0.957,0.552,2.18,0.225,2.732-0.732l1-1.732c0.552-0.957,0.225-2.18-0.732-2.732L26.5,18.598c-2-1.155-2-4.041,0-5.196l0.526-0.304C27.983,12.546,28.311,11.323,27.758,10.366z"/>
          </svg>
        </button>
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              background: colors.app.background,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              color: colors.icon.hover,
              padding: 0,
            }}
          >
            {userInitial}
          </button>
          {userMenuOpen && (
            <div style={{
              position: "fixed",
              left: 56,
              bottom: 8,
              background: colors.card.background,
              border: `1px solid ${colors.card.border}`,
              boxShadow: colors.card.shadow,
              borderRadius: 8,
              minWidth: 200,
              zIndex: 9999,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 14px",
                fontSize: 12,
                color: "#6b7280",
                borderBottom: `1px solid ${colors.card.border}`,
                wordBreak: "break-all",
              }}>
                {session?.user?.email}
              </div>
              <button
                onMouseEnter={() => setLogoutHovered(true)}
                onMouseLeave={() => setLogoutHovered(false)}
                onClick={async () => {
                  await fetch('/api/visit/ping', { method: 'POST' });
                  signOut({ callbackUrl: '/auth' });
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: logoutHovered ? colors.app.background : "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: logoutHovered ? colors.icon.hover : "#374151",
                  textAlign: "left",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                  <path fill="currentColor" d="M3.333 14.667A.667.667 0 0 1 2.667 14V2c0-.368.298-.667.666-.667h9.334c.368 0 .666.299.666.667v2H12V2.667H4v10.666h8V12h1.333v2a.667.667 0 0 1-.666.667H3.333Zm8.667-4v-2H7.333V7.333H12v-2L15.333 8 12 10.667Z"/>
                </svg>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* File panel */}
    {showFilePanel && (
      <div
        ref={filePanelRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          left: 56,
          top: 8,
          width: panelWidth,
          background: colors.card.background,
          border: `1px solid ${colors.card.border}`,
          boxShadow: colors.card.shadow,
          borderRadius: 8,
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${colors.card.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Open PDF</span>
          <button
            onClick={() => setShowFilePanel(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: colors.card.close, fontSize: 18, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadLoading}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: colors.filePanel.uploadBtnBg,
              border: `1px solid ${colors.filePanel.uploadBtnBorder}`,
              borderRadius: 6,
              cursor: uploadLoading ? "not-allowed" : "pointer",
              color: colors.filePanel.uploadBtnColor,
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {uploadLoading ? "Loading…" : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Upload from PC
              </>
            )}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="url"
              value={fileUrl}
              onChange={e => { setFileUrl(e.target.value); setFileUrlError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleUrlLoad(); }}
              placeholder="Paste PDF URL…"
              style={{
                flex: 1,
                padding: "6px 10px",
                border: `1px solid ${fileUrlError ? '#ef4444' : colors.card.border}`,
                borderRadius: 6,
                fontSize: 12,
                background: colors.filePanel.urlInputBg,
                outline: "none",
              }}
            />
            <button
              onClick={handleUrlLoad}
              disabled={uploadLoading || !fileUrl.trim()}
              style={{
                padding: "6px 12px",
                background: fileUrl.trim() ? colors.icon.hover : colors.card.border,
                border: "none",
                borderRadius: 6,
                cursor: fileUrl.trim() && !uploadLoading ? "pointer" : "not-allowed",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Load
            </button>
          </div>
          {fileUrlError && (
            <div style={{ fontSize: 11, color: "#ef4444" }}>{fileUrlError}</div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${colors.card.border}` }}>
            <div style={{
              padding: "6px 14px 4px",
              fontSize: 11,
              color: colors.filePanel.sectionLabel,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              Books
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {userFiles.map(f => {
                const isActive = `/api/files/${f.id}/content` === pdfPath;
                return (
                  <div
                    key={f.id}
                    className={`book-row${isActive ? ' book-row-active' : ''}`}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <button
                      onClick={() => {
                        if (isActive) { setShowFilePanel(false); return; }
                        setUserFiles(prev => [f, ...prev.filter(ff => ff.id !== f.id)]);
                        loadFile(`/api/files/${f.id}/content`, f.id, f.scrollOffset);
                      }}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        padding: "7px 0 7px 14px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      {isActive ? (
                        <>
                          {deviceType === 'mobile' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="book-row-device-icon book-row-icon">
                              <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/>
                            </svg>
                          ) : deviceType === 'tablet' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="book-row-device-icon book-row-icon">
                              <rect x="3" y="2" width="18" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="book-row-device-icon book-row-icon">
                              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                          )}
                          <span className="book-row-close" onClick={handleCloseFile}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </span>
                        </>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="book-row-icon" style={{ flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      )}
                      <span className="book-row-name">{f.name}</span>
                    </button>
                    <button className="book-row-trash" onClick={(e) => handleDeleteFile(e, f.id)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
              <div style={{ height: 28 }} />
            </div>
          </div>
      </div>
    )}

    {/* Main scroll area */}
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onClick={() => {
        const selectedText = getSelectedText();
        if (selectedText) {
          const selRect = getSelectionRect();
          window.getSelection().removeAllRanges();
          if (activeSpanRef.current) {
            activeSpanRef.current.style.background = colors.word.background;
            activeSpanRef.current = null;
          }
          const cardPos = computeCardPos(selRect);
          setCard(null);
          setWordStatus(null);
          setLoadingPos({ x: selRect.left, y: selRect.bottom + 8 });
          translateWord(selectedText, sourceLang).then(async translation => {
            setLoadingPos(null);
            const status = translation && !translation.includes(' ')
              ? await fetch(`/api/vocabulary/check?word=${encodeURIComponent(selectedText)}&sourceLang=${encodeURIComponent(sourceLang)}`).then(r => r.ok ? r.json() : null)
              : null;
            setCard({ word: selectedText, translation, cefrLevel: null, ...cardPos });
            setWordStatus(status);
          });
          return;
        }
        closeCard();
      }}
      className="pdf-scroll-container"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 48,
        overflowY: "scroll",
        overflowX: "auto",
        background: colors.app.background,
        userSelect: (card || loadingPos) ? "none" : "text",
      }}
    >
      {/* Empty state */}
      {filesLoaded && pdfPath === null && (
        <div style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: colors.icon.default,
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#6b7280" }}>No PDF open</div>
          <button
            onClick={() => setShowFilePanel(true)}
            style={{
              marginTop: 4,
              padding: "8px 20px",
              background: colors.icon.hover,
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Open PDF
          </button>
        </div>
      )}

      {/* PDF loading indicator */}
      {pdfPath !== null && pages.length === 0 && (
        <div style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div className="pdf-spinner" />
        </div>
      )}

      <div style={{ paddingTop: 20, paddingBottom: 20 }}>
        {pages.map(page => (
          <div
            key={page.pageNum}
            style={{
              paddingLeft: `max(16px, calc(50% - ${page.width / 2}px))`,
              paddingRight: 16,
              marginBottom: 20,
            }}
          >
            <div ref={pageRef} data-pagenum={page.pageNum} style={{ width: page.width }}>
              <PageView
                page={page}
                isVisible={visiblePages.has(page.pageNum)}
                onWordClick={onWordClick}
              />
            </div>
          </div>
        ))}
      </div>

      {loadingPos && (
        <div style={{ position: "fixed", top: loadingPos.y, left: loadingPos.x, zIndex: 9999 }}>
          <div className="pdf-spinner" />
        </div>
      )}

      {card && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: card.top ?? 'auto',
            bottom: card.bottom ?? 'auto',
            left: card.x,
            background: colors.card.background,
            border: `1px solid ${colors.card.border}`,
            boxShadow: colors.card.shadow,
            opacity: colors.card.opacity,
            borderRadius: 8,
            padding: "12px 16px",
            minWidth: 200,
            maxWidth: 320,
            maxHeight: window.innerHeight - 32,
            overflowY: 'auto',
            zIndex: 9999,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: colors.card.word }}>
                {card.word}
              </div>
              {!card.word.includes(' ') && (
                <button
                  onMouseEnter={() => setSpeakerHovered(true)}
                  onMouseLeave={() => setSpeakerHovered(false)}
                  onClick={() => {
                    if (typeof speechSynthesis === 'undefined') return;
                    speechSynthesis.cancel();
                    const utter = new SpeechSynthesisUtterance(card.word);
                    utter.lang = sourceLang;
                    speechSynthesis.speak(utter);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: speakerHovered ? colors.icon.hover : '#111827',
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M16 8.99998C16.5 9.49998 17 10.5 17 12C17 13.5 16.5 14.5 16 15M3 10.5V13.5C3 14.6046 3.5 15.5 5.5 16C7.5 16.5 9 21 12 21C14 21 14 3 12 3C9 3 7.5 7.5 5.5 8C3.5 8.5 3 9.39543 3 10.5Z"/>
                  </svg>
                </button>
              )}
              {card.cefrLevel && (
                <span style={{
                  background: colors.cefr[card.cefrLevel],
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: 0.5,
                }}>
                  {card.cefrLevel}
                </span>
              )}
            </div>
            <button
              onClick={closeCard}
              onMouseEnter={() => setCloseHovered(true)}
              onMouseLeave={() => setCloseHovered(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: closeHovered ? colors.icon.hover : colors.card.close,
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 14, color: colors.card.translation }}>
            {card.translation}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <button
              onMouseEnter={() => setStarHovered(true)}
              onMouseLeave={() => setStarHovered(false)}
              onClick={async () => {
                if (!card || wordStatus?.isActive || (card.word.includes(' ') && card.translation?.includes(' ')) || starSaving) return;
                setStarSaving(true);
                const res = await fetch('/api/vocabulary/active', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ word: card.word, translation: card.translation, sourceLang, targetLang }),
                });
                setStarSaving(false);
                if (res.ok) setWordStatus({ inVocab: true, isActive: true });
              }}
              style={{
                width: 36,
                height: 36,
                background: "none",
                border: `1px solid ${colors.card.border}`,
                borderRadius: 4,
                cursor: card && !wordStatus?.isActive && !(card.word.includes(' ') && card.translation?.includes(' ')) && !starSaving ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: wordStatus?.isActive ? colors.icon.hover : (starHovered ? colors.icon.hover : colors.icon.default),
              }}
            >
              {starSaving
                ? <div className="pdf-spinner" style={{ width: 16, height: 16 }} />
                : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={wordStatus?.isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
                  </svg>
              }
            </button>
            <button
              onMouseEnter={() => setBookHovered(true)}
              onMouseLeave={() => setBookHovered(false)}
              onClick={async () => {
                if (!card || wordStatus?.inVocab || (card.word.includes(' ') && card.translation?.includes(' ')) || bookSaving) return;
                setBookSaving(true);
                const res = await fetch('/api/vocabulary', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ word: card.word, translation: card.translation, sourceLang, targetLang }),
                });
                setBookSaving(false);
                if (res.ok) setWordStatus(prev => ({ ...prev, inVocab: true }));
              }}
              style={{
                width: 36,
                height: 36,
                background: "none",
                border: `1px solid ${colors.card.border}`,
                borderRadius: 4,
                cursor: card && !wordStatus?.inVocab && !(card.word.includes(' ') && card.translation?.includes(' ')) && !bookSaving ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: wordStatus?.inVocab ? colors.icon.hover : (bookHovered ? colors.icon.hover : colors.icon.default),
              }}
            >
              {bookSaving
                ? <div className="pdf-spinner" style={{ width: 16, height: 16 }} />
                : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 7v14"/>
                    <path d="M16 12h2"/>
                    <path d="M16 8h2"/>
                    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>
                    <path d="M6 12h2"/>
                    <path d="M6 8h2"/>
                  </svg>
              }
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
