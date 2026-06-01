import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const word = searchParams.get('word');
  const sourceLang = searchParams.get('sourceLang');
  const userId = Number(session.user.id);

  const vocabWord = await prisma.word.findFirst({
    where: { userId, word, sourceLang, isHidden: false },
    include: { activeWords: { where: { userId, isHidden: false } } },
  });

  return NextResponse.json({
    inVocab: !!vocabWord,
    isActive: !!(vocabWord?.activeWords?.length),
  });
}
