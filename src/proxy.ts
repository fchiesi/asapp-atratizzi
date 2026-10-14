import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Middleware: protege rotas (app) exigindo login.
 *
 * - Paginas (sem /api): redireciona pra /login quando nao logado.
 * - APIs (/api/*, exceto /api/auth): retorna 401 JSON quando nao logado.
 *   Isso evita que fetch() em client components receba HTML do /login
 *   (e quebre com "Unexpected token '/' is not valid JSON").
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isApiRoute = pathname.startsWith("/api/");
  const isPublicApi = pathname.startsWith("/api/auth");
  const isPublicPage = pathname.startsWith("/login") || pathname === "/";

  if (!isLoggedIn) {
    if (isPublicApi || isPublicPage) {
      return NextResponse.next();
    }
    if (isApiRoute) {
      return NextResponse.json(
        { error: "Nao autorizado" },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Logado tentando ir pra /login -> manda pra pagina inicial
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next.js internals + arquivos estaticos da PWA + assets com extensao.
  // CRITICO: sem isso, /manifest.json e /sw.js viam redirect pra /login,
  // o que quebrava a instalacao como PWA no celular (atalho ficava dumb,
  // sem icone, sem display standalone).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|webmanifest|js|css|woff|woff2|ttf)).*)",
  ],
};
