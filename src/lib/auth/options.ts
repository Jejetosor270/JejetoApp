import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { authenticateEmployee } from "@/domain/users/authentication";
import { loginInputSchema } from "@/domain/users/validation";
import { getDatabase } from "@/lib/db";
import { getAuthenticationEnvironment } from "@/lib/env/auth";

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        getAuthenticationEnvironment();
        const input = loginInputSchema.safeParse(credentials);

        if (!input.success) {
          return null;
        }

        const employee = await authenticateEmployee(input.data, {
          findByNormalizedEmail: async (email) =>
            getDatabase().user.findUnique({
              where: { email },
              select: {
                email: true,
                id: true,
                isActive: true,
                name: true,
                passwordHash: true,
                role: true,
              },
            }),
        });

        if (!employee) {
          return null;
        }

        return {
          email: employee.email,
          id: employee.id,
          name: employee.name,
          role: employee.role,
        };
      },
    }),
  ],
  ...(process.env.AUTH_SECRET ? { secret: process.env.AUTH_SECRET } : {}),
  session: {
    maxAge: 8 * 60 * 60,
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }

      return session;
    },
  },
};
