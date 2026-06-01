import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const userId = Number(session.user.id);

  const file = await prisma.userFile.findFirst({ where: { id: Number(id), userId } });
  if (!file) return new NextResponse('Not found', { status: 404 });

  const filePath = path.join(process.cwd(), 'uploads', file.path);
  let fileBuffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch {
    return new NextResponse('File not found on disk', { status: 404 });
  }

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(fileBuffer.length),
    },
  });
}
