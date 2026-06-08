import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await prisma.word.findMany({
    where: { userId: Number(session.user.id), isHidden: false },
    orderBy: { addedAt: 'desc' },
  });
  const words = raw.map(w => ({
    id: w.id,
    word: w.word,
    translation: w.translation,
    sourceLang: w.sourceLang,
    targetLang: w.targetLang,
    cefrLevel: w.cefrLevel ?? null,
  }));
  const sourceLangs = [...new Set(words.map(w => w.sourceLang))].sort();
  const targetLangs = [...new Set(words.map(w => w.targetLang))].sort();
  return NextResponse.json({ words, sourceLangs, targetLangs });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { word, translation, sourceLang, targetLang, cefrLevel = null } = await request.json();
  const userId = Number(session.user.id);

  const saved = await prisma.word.upsert({
    where: { userId_word_sourceLang: { userId, word, sourceLang } },
    update: { translation, cefrLevel },
    create: { userId, word, translation, sourceLang, targetLang, cefrLevel },
  });

  return NextResponse.json({ word: saved });
}
