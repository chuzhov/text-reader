import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { userId: Number(session.user.id) } });
  if (!settings) return NextResponse.json({ sourceLang: 'en', targetLang: 'ru' });
  return NextResponse.json({ sourceLang: settings.sourceLang, targetLang: settings.targetLang });
}
