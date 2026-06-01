import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const files = await prisma.userFile.findMany({
    where: { userId: Number(session.user.id) },
    orderBy: [{ lastOpenedAt: 'desc' }, { uploadedAt: 'desc' }],
  });
  return NextResponse.json({ files });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = Number(session.user.id);
  const contentType = request.headers.get('content-type') || '';

  let fileBuffer, originalName;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }
    fileBuffer = Buffer.from(await file.arrayBuffer());
    originalName = file.name;
  } else {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    let res;
    try {
      res = await fetch(url);
    } catch {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 400 });
    }
    if (!res.ok) return NextResponse.json({ error: 'URL returned an error' }, { status: 400 });

    fileBuffer = Buffer.from(await res.arrayBuffer());
    const urlPathname = new URL(url).pathname;
    originalName = urlPathname.split('/').pop() || 'document.pdf';
    if (!originalName.toLowerCase().endsWith('.pdf')) originalName += '.pdf';
  }

  // Validate PDF magic bytes
  if (fileBuffer[0] !== 0x25 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x44 || fileBuffer[3] !== 0x46) {
    return NextResponse.json({ error: 'File is not a valid PDF' }, { status: 400 });
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
  const filename = `${userId}-${Date.now()}-${safeName}`;
  const uploadDir = path.join(process.cwd(), 'uploads');

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), fileBuffer);

  const record = await prisma.userFile.create({
    data: { userId, name: originalName, path: filename, lastOpenedAt: new Date() },
  });

  return NextResponse.json({ file: record });
}
