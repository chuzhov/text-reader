import cefrData from './cefr.json';

export function getCefrLevel(word, lang) {
  const langMap = cefrData[lang];
  if (!langMap) return null;
  const normalized = word.toLowerCase().trim();
  const direct = langMap[normalized] ?? null;
  if (direct !== null) return direct;
  if (lang === 'en' && normalized.endsWith('s')) {
    return langMap[normalized.slice(0, -1)] ?? null;
  }
  return null;
}
