'use client';

import React, { useEffect, useState, useRef, useCallback } from "react";
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
  const [pages, setPages] = useState([]);
  const [sourceLang, setSourceLang] = useState("en");
  const [card, setCard] = useState(null);
  const [loadingPos, setLoadingPos] = useState(null);
  const [visiblePages, setVisiblePages] = useState(new Set());
  const [bookHovered, setBookHovered] = useState(false);
  const [starHovered, setStarHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [bookshelfHovered, setBookshelfHovered] = useState(false);
  const [targetLang] = useState("ru");
  const [sourceLangHovered, setSourceLangHovered] = useState(false);
  const [targetLangHovered, setTargetLangHovered] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);

  const containerRef = useRef(null);
  const observerRef = useRef(null);
  const activeSpanRef = useRef(null);

  useEffect(() => {
    extractPdf("/sample.pdf").then(({ pages, sourceLang }) => {
      setPages(pages);
      setSourceLang(sourceLang);
    });
  }, []);

  // Single IntersectionObserver for all pages, using the scroll div as root
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

  function closeCard() {
    if (activeSpanRef.current) {
      activeSpanRef.current.style.background = colors.word.background;
      activeSpanRef.current = null;
    }
    setCard(null);
    setLoadingPos(null);
    setCloseHovered(false);
    setBookHovered(false);
    setStarHovered(false);
  }

  // Stable callback — PageView won't re-render when card opens/closes
  const onWordClick = useCallback(async (e) => {
    e.stopPropagation();

    const selectedText = getSelectedText();
    if (selectedText) {
      const selRect = getSelectionRect();
      window.getSelection().removeAllRanges();
      if (activeSpanRef.current) {
        activeSpanRef.current.style.background = colors.word.background;
        activeSpanRef.current = null;
      }
      const pos = { x: selRect.left, y: selRect.bottom + 8 };
      setCard(null);
      setLoadingPos(pos);
      const translation = await translateWord(selectedText, sourceLang);
      setLoadingPos(null);
      setCard({ word: selectedText, translation, cefrLevel: null, ...pos });
      return;
    }

    const word = getWordAtPoint(e.clientX, e.clientY, e.currentTarget.textContent);

    // Active highlight via direct DOM — avoids triggering a React re-render
    if (activeSpanRef.current) {
      activeSpanRef.current.style.background = colors.word.background;
    }
    activeSpanRef.current = e.currentTarget;
    e.currentTarget.style.background = colors.word.activeBackground;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = { x: rect.left, y: rect.bottom + 8 };
    setCard(null);
    setLoadingPos(pos);
    const translation = await translateWord(word, sourceLang);
    setLoadingPos(null);
    setCard({ word, translation, cefrLevel: getCefrLevel(word, sourceLang), ...pos });
  }, [sourceLang]);

  return (
    <>
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
        <button
          onMouseEnter={() => setBookshelfHovered(true)}
          onMouseLeave={() => setBookshelfHovered(false)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 32 32" fill={bookshelfHovered ? colors.icon.hover : colors.icon.default}>
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
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: "#9CA3AF",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
    <div
      ref={containerRef}
      onClick={() => {
        const selectedText = getSelectedText();
        if (selectedText) {
          const selRect = getSelectionRect();
          window.getSelection().removeAllRanges();
          if (activeSpanRef.current) {
            activeSpanRef.current.style.background = colors.word.background;
            activeSpanRef.current = null;
          }
          const pos = { x: selRect.left, y: selRect.bottom + 8 };
          setCard(null);
          setLoadingPos(pos);
          translateWord(selectedText, sourceLang).then(translation => {
            setLoadingPos(null);
            setCard({ word: selectedText, translation, cefrLevel: null, ...pos });
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
        <div
          style={{ position: "fixed", top: loadingPos.y, left: loadingPos.x, zIndex: 9999 }}
        >
          <div className="pdf-spinner" />
        </div>
      )}

      {card && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: card.y,
            left: card.x,
            background: colors.card.background,
            border: `1px solid ${colors.card.border}`,
            boxShadow: colors.card.shadow,
            opacity: colors.card.opacity,
            borderRadius: 8,
            padding: "12px 16px",
            minWidth: 200,
            maxWidth: 320,
            zIndex: 9999,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: colors.card.word }}>
                {card.word}
              </div>
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
          <div style={{ height: 48 }} />
          <div style={{ fontSize: 14, color: colors.card.translation }}>
            {card.translation}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <button
              onMouseEnter={() => setStarHovered(true)}
              onMouseLeave={() => setStarHovered(false)}
              style={{
                width: 36,
                height: 36,
                background: "none",
                border: `1px solid ${colors.card.border}`,
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: starHovered ? colors.icon.hover : colors.icon.default,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
              </svg>
            </button>
            <button
              onMouseEnter={() => setBookHovered(true)}
              onMouseLeave={() => setBookHovered(false)}
              style={{
                width: 36,
                height: 36,
                background: "none",
                border: `1px solid ${colors.card.border}`,
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: bookHovered ? colors.icon.hover : colors.icon.default,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 7v14"/>
                <path d="M16 12h2"/>
                <path d="M16 8h2"/>
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>
                <path d="M6 12h2"/>
                <path d="M6 8h2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
