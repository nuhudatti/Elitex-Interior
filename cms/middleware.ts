import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'elitex_session';

const PUBLIC_PREFIXES = ['/login', '/api/health', '/api/content', '/api/media', '/api/auth/login', '/api/auth/bootstrap'];

function isPublicPage(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const machineKey = request.headers.get('x-cms-key');

  if (pathname.startsWith('/api/')) {
    if (isPublicPage(pathname)) return NextResponse.next();
    if (session || machineKey) return NextResponse.next();
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (isPublicPage(pathname)) return NextResponse.next();

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
