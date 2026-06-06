'use client';

import { colors } from "@/utils/theme";

export default function ActiveDictPanel({ words, onClose }) {
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
      <div style={{
        padding: "10px 14px",
        borderBottom: `1px solid ${colors.card.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          Active Dictionary
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: colors.icon.default }}>
            {words.length} {words.length === 1 ? 'word' : 'words'}
          </span>
        </span>
        <button className="panel-close" onClick={onClose}>×</button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {words.length === 0 ? (
          <div style={{
            padding: "32px 16px",
            textAlign: "center",
            color: colors.icon.default,
            fontSize: 13,
          }}>
            No active words yet. Click ★ on any translated word to add it.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {words.map((w, i) => (
                <tr
                  key={w.id}
                  style={{ borderBottom: i < words.length - 1 ? `1px solid ${colors.card.border}` : "none" }}
                >
                  <td style={{ padding: "8px 14px", fontSize: 14, fontWeight: 600, color: "#111", width: "40%" }}>
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
