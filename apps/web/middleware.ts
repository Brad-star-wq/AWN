import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // The Square webhook authenticates itself by HMAC signature, not a Supabase
  // session, so it must be publicly reachable. Skip the auth gate so it is
  // never redirected to /login. (It's also excluded from the matcher below;
  // this early return is the belt-and-suspenders guard if the matcher changes.)
  if (request.nextUrl.pathname.startsWith('/api/square/')) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  // Run on everything except Next internals, static assets, and the public,
  // signature-authenticated Square webhook.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/square|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
