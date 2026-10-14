import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/roles";

/**
 * Augment dos tipos de NextAuth 5 pra incluir o role do usuario.
 * Carregado automaticamente pelo TypeScript via tsconfig (sem import explicito).
 */
declare module "next-auth" {
  interface Session {
    user: {
      role?: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
  }
}
