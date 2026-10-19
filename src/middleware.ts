/**
 * Middleware — dual duty:
 *
 * 1. Admin guard (D-12 layer 1): cheap session-JWT check (getToken) + redirect;
 *    the role is re-verified in the admin layout (server) and in every
 *    privileged Server Action / query helper.
 * 2. Nonce-based CSP (clears audit finding A-1): a fresh nonce is minted per
 *    document request, handed to Next.js via the CSP *request* header (so the
 *    framework stamps it on its bootstrap scripts) and enforced via the CSP
 *    *response* header — the official Next.js strict-CSP pattern.
 *
 * ⚠ Deliberately NOT using next-auth/middleware's withAuth wrapper: it
 * short-circuits on the sign-in page (`[signInPage, errorPage].includes(pathname)`
 * → bare NextResponse.next()) and would bypass the nonce/CSP treatment for
 * /login, whose scripts must carry the per-request nonce. getToken() gives the
 * same session semantics without the special case.
 *
 * next.config.ts keeps the static headers (XFO, nosniff, referrer,
 * permissions-policy) for ALL routes including non-documents, where the
 * per-request CSP does not apply.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function buildCsp(nonce: string, pathname: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const pdfStudio = pathname.startsWith("/studio/chapters/");
  const account = process.env.R2_ACCOUNT_ID;
  const mediaOrigin = account && /^[a-f0-9]{32}$/.test(account) ? ` https://${account}.r2.cloudflarestorage.com` : "";
  return [
    "default-src 'self'",
    // CSP3 browsers obey nonce + 'strict-dynamic' and IGNORE 'self' /
    // 'unsafe-inline' when 'strict-dynamic' is present; 'unsafe-inline' is
    // kept only as the CSP2 fallback. 'unsafe-eval' is dev-only (React
    // refresh / bundler HMR).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${pdfStudio ? " 'wasm-unsafe-eval'" : ""}`,
    // Next.js injects inline critical CSS; Radix UI sets inline style attrs.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${mediaOrigin}`,
    `font-src 'self' data:${pdfStudio ? " blob:" : ""}`,
    ...(pdfStudio ? ["worker-src 'self'"] : []),
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  // ---- Layer 1 of the admin guard (session cookie/JWT only, cheap) ----
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const signIn = new URL("/login", request.url);
      signIn.searchParams.set(
        "callbackUrl",
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(signIn);
    }
  }

  // ---- Per-request nonce-based CSP ----
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, request.nextUrl.pathname);

  // Request header: Next.js reads the CSP from here and stamps the nonce
  // on every script it renders for this request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Response header: the browser enforces the policy.
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Every document EXCEPT framework/API/media assets — CSP is meaningful
    // only on HTML responses. /login deliberately stays included: its scripts
    // must carry the per-request nonce.
    "/((?!_next/static|_next/image|api/|art/|favicon.ico|icon.svg|apple-icon.png|robots.txt).*)",
  ],
};
