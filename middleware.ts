import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const isLoggedIn = !!token;
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api");
  const isLoginPage = pathname.startsWith("/login");

  if (isApi) return NextResponse.next();

  if (isLoginPage) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
