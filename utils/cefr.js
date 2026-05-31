import cefrData from './cefr.json';

export function getCefrLevel(word, lang) {
  const langMap = cefrData[lang];
  if (!langMap) return null;
  return langMap[word.toLowerCase().trim()] ?? null;
}
