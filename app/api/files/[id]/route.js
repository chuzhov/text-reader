import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = Number(session.user.id);

  const file = await prisma.userFile.findFirst({ where: { id: Number(id), userId } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.userFile.delete({ where: { id: Number(id) } });

  // Best-effort disk cleanup — ignore if file is already missing
  try {
    await unlink(path.join(process.cwd(), 'uploads', file.path));
  } catch {}

  return NextResponse.json({ ok: true });
}
