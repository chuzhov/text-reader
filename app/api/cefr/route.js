import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callGetCefr } from '@/lib/translation/index';
import { appendLog } from '@/lib/translation/logger';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const { word, sourceLang = 'en' } = await request.json();

  const result = await callGetCefr({ word, sourceLang });

  if (session?.user?.id) {
    appendLog(session.user.id, {
      provider: 'claude',
      requestType: 'cefr',
      word,
      sourceLang,
      contextBefore: '',
      contextAfter: '',
      response: JSON.stringify({ cefrLevel: result.cefrLevel, source: result.source }),
      tokensIn: result.tokensIn ?? null,
      tokensOut: result.tokensOut ?? null,
    });
  }

  return NextResponse.json({ cefrLevel: result.cefrLevel, source: result.source });
}
