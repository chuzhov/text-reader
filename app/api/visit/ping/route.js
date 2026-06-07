import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.visitId) return NextResponse.json({ ok: false }, { status: 401 });

  await prisma.userVisit.updateMany({
    where: { id: Number(session.user.visitId) },
    data: { lastVisitedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
