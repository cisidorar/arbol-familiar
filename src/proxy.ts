// Primer filtro, antes de llegar a ninguna página: sin cookie de sesión no
// se pasa del login. Es un chequeo rápido (solo mira que la cookie exista);
// la comprobación de verdad —que la sesión sea válida, de quién es y qué rol
// tiene— la hace cada página y cada ruta de la API contra la base
// (src/lib/auth/session.ts). Este filtro solo evita que alguien sin sesión
// llegue siquiera a pedir datos.

import { NextResponse, type NextRequest } from "next/server";

// Mismo nombre que SESSION_COOKIE en src/lib/auth/session.ts (acá no se
// importa ese módulo: usa la base, y el proxy debe quedar liviano).
const SESSION_COOKIE = "azb_session";

function isPublic(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname.startsWith("/invitacion/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Tienes que iniciar sesión." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Todo menos los archivos estáticos de Next y el ícono del sitio.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
