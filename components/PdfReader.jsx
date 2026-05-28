'use client';

import React, { useEffect, useState, useRef } from "react";
import { extractPdf } from "@/utils/pdf_processor";
import { translateWord } from "@/utils/translation_api";
import { colors } from "@/utils/theme";

export default function PdfReader() {
  const [pages, setPages] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  const [hoveredWord, setHoveredWord] = useState(null);

  const containerRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await extractPdf("/sample.pdf");
    setPages(data);
  }

  async function onHover(word, e) {
    const rect = e.target.getBoundingClientRect();
    setHoveredWord(word);

    const translation = await translateWord(word);

    setTooltip({
      word,
      translation,
      x: rect.left,
      y: rect.top - 40,
    });
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: "100vh",
        overflowY: "scroll",
        background: colors.appBackground,
        padding: 20,
      }}
    >
      {pages.map(page => (
        <div
          key={page.pageNum}
          style={{
            background: colors.pageBackground,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, color: colors.pageLabel, padding: "4px 8px" }}>
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
                onMouseEnter={(e) => onHover(w.text, e)}
                onMouseLeave={() => { setTooltip(null); setHoveredWord(null); }}
                style={{
                  position: "absolute",
                  left: w.x,
                  top: w.y,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  background: hoveredWord === w.text ? colors.wordHoverBackground : colors.wordBackground,
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

      {tooltip && (
        <div
          style={{
            position: "fixed",
            top: tooltip.y,
            left: tooltip.x,
            background: colors.tooltipBackground,
            color: colors.tooltipText,
            padding: 8,
            borderRadius: 6,
            fontSize: 12,
            zIndex: 9999,
            maxWidth: 240,
          }}
        >
          <div style={{ fontWeight: "bold" }}>{tooltip.word}</div>
          <div>{tooltip.translation}</div>
        </div>
      )}
    </div>
  );
}
