'use client';

import { useState } from "react";
import { colors } from "@/utils/theme";

const LANG_LABELS = {
  en: "English", ru: "Russian", fr: "French", de: "German", es: "Spanish",
  it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", uk: "Ukrainian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic", tr: "Turkish",
};

function langLabel(code) {
  return LANG_LABELS[code] || code.toUpperCase();
}

export default function ActiveDictPanel({
  words, sourceLangs, targetLangs, defaultSource, defaultTarget, onClose,
}) {
  const [sortMode, setSortMode] = useState("date");
  const [selectedSource, setSelectedSource] = useState(
    sourceLangs.includes(defaultSource) ? defaultSource : (sourceLangs[0] ?? defaultSource)
  );
  const [selectedTarget, setSelectedTarget] = useState(
    targetLangs.includes(defaultTarget) ? defaultTarget : (targetLangs[0] ?? defaultTarget)
  );

  const filtered = words
    .filter(w => w.sourceLang === selectedSource && w.targetLang === selectedTarget)
    .sort((a, b) => sortMode === "alpha" ? a.word.localeCompare(b.word) : 0);

  const selectStyle = {
    fontSize: 12,
    border: `1px solid ${colors.card.border}`,
    borderRadius: 4,
    padding: "2px 4px",
    background: colors.card.background,
    color: "#374151",
    cursor: "pointer",
    outline: "none",
  };

  return (
    <div style={{
      position: "fixed",
      top: 56,
      left: 56,
      right: 56,
      maxHeight: "calc(100vh - 72px)",
      background: colors.card.background,
      border: `1px solid ${colors.card.border}`,
      boxShadow: colors.card.shadow,
      borderRadius: 8,
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${colors.card.border}`,
        background: colors.sidebar.background,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Active Dictionary
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: colors.icon.default }}>
            {filtered.length} {filtered.length === 1 ? 'word' : 'words'}
          </span>
        </span>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>

      {/* Language selectors */}
      <div style={{
        padding: "8px 14px",
        borderBottom: `1px solid ${colors.card.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <select
          value={selectedSource}
          onChange={e => setSelectedSource(e.target.value)}
          style={selectStyle}
        >
          {sourceLangs.length > 0 ? sourceLangs.map(l => (
            <option key={l} value={l}>{langLabel(l)}</option>
          )) : (
            <option value={defaultSource}>{langLabel(defaultSource)}</option>
          )}
        </select>
        <span style={{ fontSize: 12, color: colors.icon.default }}>{">"}</span>
        <select
          value={selectedTarget}
          onChange={e => setSelectedTarget(e.target.value)}
          style={selectStyle}
        >
          {targetLangs.length > 0 ? targetLangs.map(l => (
            <option key={l} value={l}>{langLabel(l)}</option>
          )) : (
            <option value={defaultTarget}>{langLabel(defaultTarget)}</option>
          )}
        </select>
        <span style={{ width: 1, alignSelf: "stretch", background: colors.card.border, margin: "0 4px" }} />
        <div style={{ background: colors.sidebar.background, borderRadius: 6, padding: 4, display: "flex", flexDirection: "row", gap: 6 }}>
          <button
            onClick={() => setSortMode("date")}
            title="Sort by date added"
            style={{ background: "none", border: "none", padding: 2, cursor: "pointer", display: "flex", alignItems: "center", color: sortMode === "date" ? colors.icon.hover : colors.icon.default }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9H21M12 18V12M15 15.001L9 15M7 3V5M17 3V5M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z"/>
            </svg>
          </button>
          <button
            onClick={() => setSortMode("alpha")}
            title="Sort alphabetically"
            style={{ background: "none", border: "none", padding: 2, cursor: "pointer", display: "flex", alignItems: "center", color: sortMode === "alpha" ? colors.icon.hover : colors.icon.default }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10L6.5 3 10 10M4.5 7.5h4M3 14h8L3 21h8M16 3v18M13 18l3 3 3-3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Word list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "32px 16px",
            textAlign: "center",
            color: colors.icon.default,
            fontSize: 13,
          }}>
            {words.length === 0
              ? "No active words yet. Click ★ on any translated word to add it."
              : "No active words for this language pair."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {filtered.map((w, i) => (
                <tr
                  key={w.id}
                  style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${colors.card.border}` : "none" }}
                >
                  <td style={{ padding: "8px 14px", fontSize: 14, color: "#111", width: "40%" }}>
                    {w.word}
                  </td>
                  <td style={{ padding: "8px 14px", fontSize: 13, color: "#6b7280" }}>
                    {w.translation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
