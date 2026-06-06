import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = Number(session.user.id);
  const activeWords = await prisma.activeWord.findMany({
    where: { userId, isHidden: false },
    include: { word: true },
    orderBy: { addedAt: 'desc' },
  });
  const words = activeWords.map(aw => ({
    id: aw.wordId,
    word: aw.word.word,
    translation: aw.word.translation,
    sourceLang: aw.word.sourceLang,
    targetLang: aw.word.targetLang,
  }));
  const sourceLangs = [...new Set(words.map(w => w.sourceLang))].sort();
  const targetLangs = [...new Set(words.map(w => w.targetLang))].sort();
  return NextResponse.json({ words, sourceLangs, targetLangs });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { word, translation, sourceLang, targetLang } = await request.json();
  const userId = Number(session.user.id);

  const savedWord = await prisma.word.upsert({
    where: { userId_word_sourceLang: { userId, word, sourceLang } },
    update: { translation },
    create: { userId, word, translation, sourceLang, targetLang },
  });

  const active = await prisma.activeWord.upsert({
    where: { userId_wordId: { userId, wordId: savedWord.id } },
    update: {},
    create: { userId, wordId: savedWord.id },
  });

  return NextResponse.json({ word: savedWord, active });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { wordId } = await request.json();
  const userId = Number(session.user.id);

  await prisma.activeWord.deleteMany({ where: { userId, wordId: Number(wordId) } });
  return NextResponse.json({ success: true });
}
