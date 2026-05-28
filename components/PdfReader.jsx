'use client';

import React, { useEffect, useState, useRef } from "react";
import { extractPdf } from "@/utils/pdf_processor";
import { translateWord } from "@/utils/translation_api";
import { colors } from "@/utils/theme";

export default function PdfReader() {
  const [pages, setPages] = useState([]);
  const [sourceLang, setSourceLang] = useState("en");
  const [card, setCard] = useState(null); // { word, translation, x, y } | null
  const [activeWord, setActiveWord] = useState(null);

  const containerRef = useRef(null);

  useEffect(() => {
    extractPdf("/sample.pdf").then(({ pages, sourceLang }) => {
      setPages(pages);
      setSourceLang(sourceLang);
    });
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") closeCard(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function closeCard() {
    setCard(null);
    setActiveWord(null);
  }

  async function onWordClick(word, e) {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    setActiveWord(word);
    setCard({ word, translation: null, x: rect.left, y: rect.bottom + 8 });

    const translation = await translateWord(word, sourceLang);
    setCard(prev => prev?.word === word ? { ...prev, translation } : prev);
  }

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
        <div
          key={page.pageNum}
          style={{
            background: colors.page.background,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, color: colors.page.label, padding: "4px 8px" }}>
            Page {page.pageNum}
          </div>

          <div
            style={{
              position: "relative",
              width: page.width,
              height: page.height,
            }}
          >
            {page.words.map((w, i) => (
              <span
                key={i}
                onClick={(e) => onWordClick(w.text, e)}
                style={{
                  position: "absolute",
                  left: w.x,
                  top: w.y,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  background: activeWord === w.text
                    ? colors.word.activeBackground
                    : colors.word.background,
                  padding: "1px 3px",
                  borderRadius: 3,
                }}
              >
                {w.text}
              </span>
            ))}
          </div>
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
