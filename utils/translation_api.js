export async function translateWord(word, sourceLang = "en", targetLang = "ru") {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: word, sourceLang, targetLang }),
  });

  const data = await res.json();
  return data.translation;
}
