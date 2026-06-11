import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number(session.user.id);
  const [raw, activeWords] = await Promise.all([
    prisma.word.findMany({
      where: { userId, isHidden: false },
      orderBy: { addedAt: 'desc' },
    }),
    prisma.activeWord.findMany({
      where: { userId, isHidden: false },
      select: { wordId: true },
    }),
  ]);
  const activeIds = new Set(activeWords.map(aw => aw.wordId));
  const words = raw.map(w => ({
    id: w.id,
    word: w.word,
    translation: w.translation,
    sourceLang: w.sourceLang,
    targetLang: w.targetLang,
    cefrLevel: w.cefrLevel ?? null,
    isActive: activeIds.has(w.id),
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

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { wordId } = await request.json();
  await prisma.word.update({
    where: { id: Number(wordId) },
    data: { isHidden: true },
  });
  return NextResponse.json({ success: true });
}
