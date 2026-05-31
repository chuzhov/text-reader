import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const createPrismaClient = () =>
  new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL }) });

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
