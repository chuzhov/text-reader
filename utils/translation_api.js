export async function translateWord(word, targetLang = "en") {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: word, targetLang }),
  });

  const data = await res.json();
  return data.translation;
}
