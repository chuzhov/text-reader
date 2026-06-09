'use client';

import { useMemo, useState } from "react";
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
  words, sourceLangs, targetLangs, defaultSource, defaultTarget, onClose, onRemoveWord,
}) {
  const [sortMode, setSortMode] = useState("date");
  const [selectedSource, setSelectedSource] = useState(
    sourceLangs.includes(defaultSource) ? defaultSource : (sourceLangs[0] ?? defaultSource)
  );
  const [selectedTarget, setSelectedTarget] = useState(
    targetLangs.includes(defaultTarget) ? defaultTarget : (targetLangs[0] ?? defaultTarget)
  );
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredBtn, setHoveredBtn] = useState(null); // { row, btn: 'speaker'|'remove'|'confirm'|'cancel' }
  const [pendingRemove, setPendingRemove] = useState(null);

  const filtered = useMemo(() =>
    words
      .filter(w => w.sourceLang === selectedSource && w.targetLang === selectedTarget)
      .sort((a, b) => sortMode === "alpha" ? a.word.localeCompare(b.word) : 0),
    [words, selectedSource, selectedTarget, sortMode]
  );

  const maxWordPx = useMemo(() => {
    if (filtered.length === 0 || typeof document === 'undefined') return 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    return Math.max(...filtered.map(w => Math.ceil(ctx.measureText(w.word).width)));
  }, [filtered]);

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

  const actionBtnStyle = (row, btn) => ({
    background: "none",
    border: "none",
    padding: "0 2px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    color: hoveredBtn?.row === row && hoveredBtn?.btn === btn ? colors.icon.hover : colors.icon.default,
  });

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

      {/* Language selectors + sort toggle */}
      <div style={{
        padding: "8px 14px",
        borderBottom: `1px solid ${colors.card.border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        flexWrap: "wrap",
      }}>
        <select value={selectedSource} onChange={e => setSelectedSource(e.target.value)} style={selectStyle}>
          {sourceLangs.length > 0 ? sourceLangs.map(l => (
            <option key={l} value={l}>{langLabel(l)}</option>
          )) : (
            <option value={defaultSource}>{langLabel(defaultSource)}</option>
          )}
        </select>
        <span style={{ fontSize: 12, color: colors.icon.default }}>{">"}</span>
        <select value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} style={selectStyle}>
          {targetLangs.length > 0 ? targetLangs.map(l => (
            <option key={l} value={l}>{langLabel(l)}</option>
          )) : (
            <option value={defaultTarget}>{langLabel(defaultTarget)}</option>
          )}
        </select>
        <span style={{ width: 1, alignSelf: "stretch", background: colors.card.border, margin: "0 4px" }} />
        <div style={{ background: colors.app.background, borderRadius: 6, padding: 1, display: "flex", flexDirection: "row", gap: 1 }}>
          <button
            onClick={() => setSortMode("date")}
            title="Sort by date added"
            style={{ background: sortMode === "date" ? "#fff" : "none", border: "none", padding: 4, cursor: "pointer", display: "flex", alignItems: "center", borderRadius: 5, color: sortMode === "date" ? colors.icon.hover : colors.icon.default }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9H21M12 18V12M15 15.001L9 15M7 3V5M17 3V5M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V8.2C21 7.07989 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z"/>
            </svg>
          </button>
          <button
            onClick={() => setSortMode("alpha")}
            title="Sort alphabetically"
            style={{ background: sortMode === "alpha" ? "#fff" : "none", border: "none", padding: 4, cursor: "pointer", display: "flex", alignItems: "center", borderRadius: 5, color: sortMode === "alpha" ? colors.icon.hover : colors.icon.default }}
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
              {filtered.map((w, i) => {
                const cefr = w.cefrLevel;
                const isRowHovered = hoveredRow === i;
                return (
                  <tr
                    key={w.id}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => { setHoveredRow(null); setHoveredBtn(null); }}
                    style={{
                      borderBottom: i < filtered.length - 1 ? `1px solid ${colors.card.border}` : "none",
                      background: (isRowHovered || pendingRemove === i) ? colors.filePanel.itemHoverBg : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px 4px 8px 14px", fontSize: 12, color: colors.icon.default, textAlign: "right", whiteSpace: "nowrap", width: 1 }}>
                      {i + 1}.
                    </td>
                    <td style={{ padding: "8px 8px 8px 6px", width: 48, verticalAlign: "middle" }}>
                      {cefr && (
                        <span style={{ background: colors.cefr[cefr], color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: 0.5 }}>
                          {cefr}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 14px 8px 0" }}>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ minWidth: maxWordPx + 8, fontSize: 14, color: "#111" }}>
                          {w.word}
                        </span>
                        {pendingRemove === i ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'confirm' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              onClick={() => { onRemoveWord(w.id); setPendingRemove(null); }}
                              title="Confirm removal"
                              style={actionBtnStyle(i, 'confirm')}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            </button>
                            <button
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'cancel' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              onClick={() => setPendingRemove(null)}
                              title="Cancel"
                              style={actionBtnStyle(i, 'cancel')}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4, visibility: isRowHovered ? "visible" : "hidden" }}>
                            <button
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'speaker' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              onClick={() => {
                                if (typeof speechSynthesis === 'undefined') return;
                                speechSynthesis.cancel();
                                const utter = new SpeechSynthesisUtterance(w.word);
                                utter.lang = selectedSource;
                                speechSynthesis.speak(utter);
                              }}
                              title="Pronounce"
                              style={actionBtnStyle(i, 'speaker')}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M16 8.99998C16.5 9.49998 17 10.5 17 12C17 13.5 16.5 14.5 16 15M3 10.5V13.5C3 14.6046 3.5 15.5 5.5 16C7.5 16.5 9 21 12 21C14 21 14 3 12 3C9 3 7.5 7.5 5.5 8C3.5 8.5 3 9.39543 3 10.5Z"/>
                              </svg>
                            </button>
                            <button
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'remove' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              onClick={() => setPendingRemove(i)}
                              title="Remove from Active Dictionary"
                              style={actionBtnStyle(i, 'remove')}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
                                <line x1="9" y1="12.5" x2="15" y2="12.5"/>
                              </svg>
                            </button>
                          </div>
                        )}
                        <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280" }}>
                          {w.translation}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
