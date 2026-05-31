import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const words = await prisma.word.findMany({
    where: { userId: Number(session.user.id) },
    orderBy: { addedAt: 'desc' },
  });
  return NextResponse.json({ words });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { word, translation, sourceLang, targetLang } = await request.json();
  const userId = Number(session.user.id);

  const saved = await prisma.word.upsert({
    where: { userId_word_sourceLang: { userId, word, sourceLang } },
    update: { translation },
    create: { userId, word, translation, sourceLang, targetLang },
  });

  return NextResponse.json({ word: saved });
}
