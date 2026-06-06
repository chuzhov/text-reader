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
  const [selectedSource, setSelectedSource] = useState(
    sourceLangs.includes(defaultSource) ? defaultSource : (sourceLangs[0] ?? defaultSource)
  );
  const [selectedTarget, setSelectedTarget] = useState(
    targetLangs.includes(defaultTarget) ? defaultTarget : (targetLangs[0] ?? defaultTarget)
  );

  const filtered = words.filter(
    w => w.sourceLang === selectedSource && w.targetLang === selectedTarget
  );

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
        <span style={{ fontSize: 12, color: colors.icon.default }}>Show:</span>
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
        <span style={{ fontSize: 12, color: colors.icon.default }}>→</span>
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
