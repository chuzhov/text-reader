import { NextResponse } from 'next/server';

export async function POST(request) {
  const { text, targetLang = 'en' } = await request.json();

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json();
    const translation = data.responseData?.translatedText ?? text;
    return NextResponse.json({ translation });
  } catch {
    return NextResponse.json({ translation: text });
  }
}
