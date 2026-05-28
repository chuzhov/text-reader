'use client';

import React, { useEffect, useState, useRef, useCallback } from "react";
import { extractPdf } from "@/utils/pdf_processor";
import { translateWord } from "@/utils/translation_api";
import { colors } from "@/utils/theme";

// Memoized — only re-renders when isVisible flips or page data changes
const PageView = React.memo(function PageView({ page, isVisible, onWordClick }) {
  return (
    <div style={{ background: colors.page.background, marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: colors.page.label, padding: "4px 8px" }}>
        Page {page.pageNum}
      </div>
      <div style={{ position: "relative", width: page.width, height: page.height }}>
        {isVisible && page.words.map((w, i) => (
          <span
            key={i}
            onClick={(e) => onWordClick(w.text, e)}
            style={{
              position: "absolute",
              left: w.x,
              top: w.y,
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
  const [visiblePages, setVisiblePages] = useState(new Set());

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
    if (containerRef.current) {
      containerRef.current.style.overflowY = card ? "hidden" : "scroll";
    }
  }, [card]);

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
  }

  // Stable callback — PageView won't re-render when card opens/closes
  const onWordClick = useCallback(async (word, e) => {
    e.stopPropagation();

    // Active highlight via direct DOM — avoids triggering a React re-render
    if (activeSpanRef.current) {
      activeSpanRef.current.style.background = colors.word.background;
    }
    activeSpanRef.current = e.currentTarget;
    e.currentTarget.style.background = colors.word.activeBackground;

    const rect = e.currentTarget.getBoundingClientRect();
    setCard({ word, translation: null, x: rect.left, y: rect.bottom + 8 });

    const translation = await translateWord(word, sourceLang);
    setCard(prev => prev?.word === word ? { ...prev, translation } : prev);
  }, [sourceLang]);

  return (
    <div
      ref={containerRef}
      onClick={closeCard}
      style={{
        height: "100vh",
        overflowY: "scroll",
        background: colors.app.background,
        padding: 20,
      }}
    >
      {pages.map(page => (
        <div key={page.pageNum} ref={pageRef} data-pagenum={page.pageNum}>
          <PageView
            page={page}
            isVisible={visiblePages.has(page.pageNum)}
            onWordClick={onWordClick}
          />
        </div>
      ))}

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
            <div style={{ fontWeight: 600, fontSize: 16, color: colors.card.word }}>
              {card.word}
            </div>
            <button
              onClick={closeCard}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: colors.card.close,
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: card.translation ? colors.card.translation : colors.card.loading }}>
            {card.translation ?? "Translating…"}
          </div>
        </div>
      )}
    </div>
  );
}
