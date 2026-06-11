'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { colors } from "@/utils/theme";

const LANG_LABELS = {
  en: "English", ru: "Russian", fr: "French", de: "German", es: "Spanish",
  it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", uk: "Ukrainian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic", tr: "Turkish",
};

function langLabel(code) {
  return LANG_LABELS[code] || code.toUpperCase();
}

export default function GeneralDictPanel({
  words, sourceLangs, targetLangs, defaultSource, defaultTarget, onClose,
  onRemoveWord, onAddToActive,
}) {
  const [sortMode, setSortMode] = useState("alpha");
  const [selectedSource, setSelectedSource] = useState(
    sourceLangs.includes(defaultSource) ? defaultSource : (sourceLangs[0] ?? defaultSource)
  );
  const [selectedTarget, setSelectedTarget] = useState(
    targetLangs.includes(defaultTarget) ? defaultTarget : (targetLangs[0] ?? defaultTarget)
  );
  const [hoveredRow, setHoveredRow] = useState(null);
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [hoveredLetter, setHoveredLetter] = useState(null);
  const [openMenu, setOpenMenu] = useState(null); // { rowIndex, word, x, y }
  const [menuActionLoading, setMenuActionLoading] = useState(null);
  const scrollContainerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    function handleMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openMenu]);

  const filtered = useMemo(() =>
    words
      .filter(w => w.sourceLang === selectedSource && w.targetLang === selectedTarget)
      .sort((a, b) => sortMode === "alpha" ? a.word.localeCompare(b.word) : 0),
    [words, selectedSource, selectedTarget, sortMode]
  );

  const letterGroups = useMemo(() => {
    if (sortMode !== "alpha") return {};
    const groups = {};
    filtered.forEach((w, i) => {
      const letter = w.word[0]?.toUpperCase() ?? '#';
      if (!(letter in groups)) groups[letter] = i;
    });
    return groups;
  }, [filtered, sortMode]);

  const uniqueLetters = useMemo(() => Object.keys(letterGroups).sort(), [letterGroups]);

  const maxWordPx = useMemo(() => {
    if (filtered.length === 0 || typeof document === 'undefined') return 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    return Math.max(...filtered.map(w => Math.ceil(ctx.measureText(w.word).width)));
  }, [filtered]);

  function scrollToLetter(letter) {
    const el = scrollContainerRef.current?.querySelector(`[data-letter-anchor="${letter}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  function handleMenuOpen(e, i, w) {
    e.stopPropagation();
    if (openMenu?.rowIndex === i) { setOpenMenu(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = w.isActive ? 40 : 84;
    const x = Math.min(rect.left, window.innerWidth - menuWidth - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const y = spaceBelow >= menuHeight ? rect.bottom + 4 : rect.top - menuHeight - 4;
    setOpenMenu({ rowIndex: i, word: w, x, y });
  }

  async function handleAddToActive() {
    const w = openMenu.word;
    setMenuActionLoading('active');
    await onAddToActive(w);
    setMenuActionLoading(null);
    setOpenMenu(null);
  }

  async function handleRemove() {
    const w = openMenu.word;
    setMenuActionLoading('remove');
    await onRemoveWord(w.id);
    setMenuActionLoading(null);
    setOpenMenu(null);
  }

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
          General Dictionary
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
      <div ref={scrollContainerRef} style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: "32px 16px",
            textAlign: "center",
            color: colors.icon.default,
            fontSize: 13,
          }}>
            {words.length === 0
              ? "No saved words yet. Click the book icon on any translated word to add it."
              : "No saved words for this language pair."}
          </div>
        ) : (
          <>
            {/* Alphabet index row */}
            {sortMode === "alpha" && uniqueLetters.length > 0 && (
              <div style={{
                position: "sticky",
                top: 0,
                background: colors.card.background,
                borderBottom: `1px solid ${colors.card.border}`,
                padding: "5px 14px",
                display: "flex",
                flexWrap: "wrap",
                gap: 2,
                zIndex: 1,
              }}>
                {uniqueLetters.map(letter => (
                  <button
                    key={letter}
                    onClick={() => scrollToLetter(letter)}
                    onMouseEnter={() => setHoveredLetter(letter)}
                    onMouseLeave={() => setHoveredLetter(null)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "1px 4px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 3,
                      color: hoveredLetter === letter ? colors.icon.hover : colors.icon.default,
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {filtered.map((w, i) => {
                  const cefr = w.cefrLevel;
                  const isRowHovered = hoveredRow === i;
                  const firstLetter = w.word[0]?.toUpperCase() ?? '#';
                  const isLetterStart = sortMode === "alpha" && letterGroups[firstLetter] === i;
                  return (
                    <tr
                      key={w.id}
                      data-letter-anchor={isLetterStart ? firstLetter : undefined}
                      onMouseEnter={() => setHoveredRow(i)}
                      onMouseLeave={() => { setHoveredRow(null); setHoveredBtn(null); }}
                      style={{
                        borderBottom: i < filtered.length - 1 ? `1px solid ${colors.card.border}` : "none",
                        background: isRowHovered || openMenu?.rowIndex === i ? colors.filePanel.itemHoverBg : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 8px", fontSize: 12, color: colors.icon.default, textAlign: "center", whiteSpace: "nowrap", width: 1 }}>
                        {sortMode === "alpha"
                          ? isLetterStart
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: colors.icon.default }}>{firstLetter}</span>
                            : <span style={{ display: "inline-block", width: 3, height: 3, background: colors.icon.default, verticalAlign: "middle" }} />
                          : `${i + 1}.`
                        }
                      </td>
                      <td style={{ padding: "8px 8px 8px 6px", width: 48, verticalAlign: "middle", textAlign: "center" }}>
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
                          <div style={{ display: "flex", gap: 4, visibility: isRowHovered || openMenu?.rowIndex === i ? "visible" : "hidden" }}>
                            {/* Speaker button */}
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
                            {/* Three-dots menu button */}
                            <button
                              onMouseEnter={() => setHoveredBtn({ row: i, btn: 'menu' })}
                              onMouseLeave={() => setHoveredBtn(null)}
                              onClick={e => handleMenuOpen(e, i, w)}
                              title="More actions"
                              style={actionBtnStyle(i, 'menu')}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="1.5"/>
                                <circle cx="12" cy="12" r="1.5"/>
                                <circle cx="12" cy="19" r="1.5"/>
                              </svg>
                            </button>
                          </div>
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
          </>
        )}
      </div>

      {/* Context menu */}
      {openMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: openMenu.x,
            top: openMenu.y,
            background: colors.card.background,
            border: `1px solid ${colors.card.border}`,
            boxShadow: colors.card.shadow,
            borderRadius: 6,
            zIndex: 200,
            minWidth: 190,
            overflow: "hidden",
          }}
        >
          <button
            onClick={handleAddToActive}
            disabled={openMenu.word.isActive || menuActionLoading === 'active'}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 12px",
              background: "none",
              border: "none",
              cursor: openMenu.word.isActive ? "default" : "pointer",
              fontSize: 13,
              color: openMenu.word.isActive ? colors.icon.default : "#111827",
              textAlign: "left",
            }}
            onMouseEnter={e => { if (!openMenu.word.isActive) e.currentTarget.style.background = colors.filePanel.itemHoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={openMenu.word.isActive ? "currentColor" : "none"}
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: openMenu.word.isActive ? colors.icon.hover : "currentColor", flexShrink: 0 }}
            >
              <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>
            </svg>
            {openMenu.word.isActive ? "Already in Active Dictionary" : "Add to Active Dictionary"}
          </button>
          {!openMenu.word.isActive && (
            <>
              <div style={{ height: 1, background: colors.card.border, margin: "0 8px" }} />
              <button
                onClick={handleRemove}
                disabled={menuActionLoading === 'remove'}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#dc2626",
                  textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                </svg>
                Remove from Dictionary
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
