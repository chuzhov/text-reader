import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

export const authOptions = {
  providers: [
    CredentialsProvider({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        const visit = await prisma.userVisit.create({ data: { userId: user.id } });
        return { id: String(user.id), email: user.email, visitId: String(visit.id) };
      },
    }),
  ],
  pages: { signIn: '/auth' },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.visitId = user.visitId; }
      return token;
    },
    async session({ session, token }) {
      if (token?.id) session.user.id = token.id;
      if (token?.visitId) session.user.visitId = token.visitId;
      return session;
    },
  },
};
