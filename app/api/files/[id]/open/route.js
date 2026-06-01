import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = Number(session.user.id);

  const file = await prisma.userFile.findFirst({ where: { id: Number(id), userId } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.userFile.update({
    where: { id: Number(id) },
    data: { lastOpenedAt: new Date() },
  });

  return NextResponse.json({ file: updated });
}
