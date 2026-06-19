import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const SUPPORTED_LANG_CODES = ['en', 'es', 'fr', 'de', 'it', 'ru', 'uk'];

export async function POST(request) {
  const { email, password, sourceLang, targetLang } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const resolvedSource = SUPPORTED_LANG_CODES.includes(sourceLang) ? sourceLang : 'en';
  const resolvedTarget = SUPPORTED_LANG_CODES.includes(targetLang) ? targetLang : 'ru';
  if (resolvedSource === resolvedTarget) {
    return NextResponse.json({ error: 'Document language and translation language must be different' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      settings: { create: { sourceLang: resolvedSource, targetLang: resolvedTarget } },
    },
  });

  return NextResponse.json({ success: true });
}
