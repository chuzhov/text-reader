const CONTEXT_SPAN_WORDS = 12;

/**
 * Collects up to CONTEXT_SPAN_WORDS words before and after the clicked word,
 * spanning page boundaries when the word is near a page edge.
 */
export function extractContext(pages, pageNum, wordIndex) {
  const pageIdx = pages.findIndex(p => p.pageNum === pageNum);
  if (pageIdx === -1) return { before: '', after: '' };

  const words = pages[pageIdx].words;

  const beforeWords = [];
  let needed = CONTEXT_SPAN_WORDS;
  for (let i = wordIndex - 1; i >= 0 && needed > 0; i--) {
    beforeWords.unshift(words[i].text);
    needed--;
  }
  if (needed > 0 && pageIdx > 0) {
    const prevWords = pages[pageIdx - 1].words;
    for (let i = prevWords.length - 1; i >= 0 && needed > 0; i--) {
      beforeWords.unshift(prevWords[i].text);
      needed--;
    }
  }

  const afterWords = [];
  needed = CONTEXT_SPAN_WORDS;
  for (let i = wordIndex + 1; i < words.length && needed > 0; i++) {
    afterWords.push(words[i].text);
    needed--;
  }
  if (needed > 0 && pageIdx < pages.length - 1) {
    const nextWords = pages[pageIdx + 1].words;
    for (let i = 0; i < nextWords.length && needed > 0; i++) {
      afterWords.push(nextWords[i].text);
      needed--;
    }
  }

  return { before: beforeWords.join(' '), after: afterWords.join(' ') };
}

export async function translateWord(word, sourceLang, context = {}) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: word, sourceLang, targetLang: 'ru', context }),
  });
  const data = await res.json();
  return data.translation;
}

export async function getCefrFromAI(word, sourceLang) {
  const res = await fetch('/api/cefr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sourceLang }),
  });
  const data = await res.json();
  return { cefrLevel: data.cefrLevel, source: data.source ?? null };
}
