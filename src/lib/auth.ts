import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isRole, type Role } from "@/lib/roles";

/**
 * NextAuth 5 - Google OAuth com whitelist de emails + role (igual ao SApp).
 *
 * ALLOWED_USERS='[{"email":"fer@x.com","role":"diretoria"},{"email":"junior@x.com","role":"producao_lider"}]'
 *
 * Sem ALLOWED_USERS ninguem entra.
 */

interface AllowedUser {
  email: string;
  role: Role;
}

function parseAllowedUsers(): Map<string, Role> {
  const map = new Map<string, Role>();
  const raw = process.env.ALLOWED_USERS?.trim();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn("ALLOWED_USERS nao eh array - ignorando");
      return map;
    }
    for (const entry of parsed) {
      const u = entry as Partial<AllowedUser>;
      if (u && typeof u.email === "string" && isRole(u.role)) {
        map.set(u.email.trim().toLowerCase(), u.role);
      } else {
        console.warn("ALLOWED_USERS entry invalida - ignorando", entry);
      }
    }
  } catch (err) {
    console.error("ALLOWED_USERS JSON invalido:", err);
  }
  return map;
}

const allowedUsers = parseAllowedUsers();

export function getRoleForEmail(email: string | null | undefined): Role | null {
  if (!email) return null;
  return allowedUsers.get(email.toLowerCase()) ?? null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (allowedUsers.size === 0) {
        console.warn("ALLOWED_USERS nao configurada - bloqueando login");
        return false;
      }
      const ok = allowedUsers.has(email);
      // login recusado fica no log da Vercel: mostra com qual conta Google a
      // pessoa esta tentando entrar
      if (!ok) console.warn(`[auth] login recusado: ${email}`);
      return ok;
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (email) {
        const role = allowedUsers.get(email);
        if (role) token.role = role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        if (typeof token.role === "string" && isRole(token.role)) {
          session.user.role = token.role;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
