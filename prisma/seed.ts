import 'dotenv/config';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import bcrypt from 'bcryptjs';

const adapter = new PrismaLibSql({ url: 'file:dev.db' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash('12345678', 10);
  await prisma.user.upsert({
    where: { email: 'testuser@email.com' },
    update: {},
    create: {
      email: 'testuser@email.com',
      passwordHash: hash,
      settings: {
        create: { sourceLang: 'en', targetLang: 'ru' },
      },
    },
  });
  console.log('Seeded: testuser@email.com / 12345678');
}

main().catch(console.error).finally(() => prisma.$disconnect());
