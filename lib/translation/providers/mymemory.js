export async function translate({ word, sourceLang, targetLang }) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${sourceLang}|${targetLang}`;
  const res = await fetch(url);
  const data = await res.json();
  return { translation: data.responseData?.translatedText ?? word };
}

export async function getCefr() {
  return { cefrLevel: null, source: null };
}
