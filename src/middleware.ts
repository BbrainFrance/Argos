import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  if (!token && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icons|manifest.json).*)",
  ],
};
