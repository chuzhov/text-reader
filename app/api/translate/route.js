import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callTranslate } from '@/lib/translation/index';
import { appendLog } from '@/lib/translation/logger';
import config from '@/lib/translation/config';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const { text, sourceLang = 'en', targetLang = 'ru', context = {} } = await request.json();

  const wordCount = text.trim().split(/\s+/).length;
  const isLongSelection = wordCount >= config.contextSpanWords;
  const effectiveContext = (isLongSelection && !config.provideContextForLongText) ? {} : context;

  try {
    const result = await callTranslate({ word: text, sourceLang, targetLang, context: effectiveContext });

    if (session?.user?.id) {
      appendLog(session.user.id, {
        provider: result.provider,
        requestType: 'translate',
        word: text,
        sourceLang,
        contextBefore: effectiveContext.before ?? '',
        contextAfter: effectiveContext.after ?? '',
        response: result.translation,
        tokensIn: result.tokensIn ?? null,
        tokensOut: result.tokensOut ?? null,
      });
    }

    return NextResponse.json({ translation: result.translation });
  } catch {
    return NextResponse.json({ translation: text });
  }
}
