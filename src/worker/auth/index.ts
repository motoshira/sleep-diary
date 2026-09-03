import { clearCookie, readCookie, serializeCookie } from "../lib/cookies.js";
import {
  authorizationUrl,
  createPkcePair,
  exchangeCode,
  redirectUri,
  verifyIdToken,
} from "./google.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session.js";
import type { SessionUser } from "./session.js";

const STATE_COOKIE = "sd_oauth_state";
const VERIFIER_COOKIE = "sd_oauth_verifier";
const STATE_TTL_SECONDS = 600;

/**
 * リクエストからログイン中のユーザーを解決する。以降の API はこれを起点に
 * テナント（user.sub）を決める。
 */
export async function getUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token, env.SESSION_SECRET);
}

/** 認証されていなければ 401 を返す。ハンドラ側は user を受け取って処理を続ける。 */
export async function withUser(
  request: Request,
  env: Env,
  handler: (user: SessionUser) => Promise<Response>
): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return handler(user);
}

/**
 * /api/auth/* と /api/me を処理する。担当外のパスなら null を返す。
 */
export async function handleAuthRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const secure = url.protocol === "https:";

  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = await getUser(request, env);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ user });
  }

  if (url.pathname === "/api/auth/login" && request.method === "GET") {
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();
    const headers = new Headers({
      Location: authorizationUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: redirectUri(url),
        state,
        codeChallenge: challenge,
      }),
    });
    headers.append(
      "Set-Cookie",
      serializeCookie(STATE_COOKIE, state, { maxAge: STATE_TTL_SECONDS, secure })
    );
    headers.append(
      "Set-Cookie",
      serializeCookie(VERIFIER_COOKIE, verifier, { maxAge: STATE_TTL_SECONDS, secure })
    );
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/api/auth/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readCookie(request, STATE_COOKIE);
    const verifier = readCookie(request, VERIFIER_COOKIE);

    if (url.searchParams.get("error")) {
      return redirectToApp(url, "?login=cancelled", secure);
    }
    if (!code || !state || !expectedState || state !== expectedState || !verifier) {
      return redirectToApp(url, "?login=failed", secure);
    }

    try {
      const idToken = await exchangeCode({
        code,
        codeVerifier: verifier,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: redirectUri(url),
      });
      const user = await verifyIdToken(idToken, env.GOOGLE_CLIENT_ID);
      const session = await createSessionToken(user, env.SESSION_SECRET);

      const headers = new Headers({ Location: `${url.origin}/` });
      headers.append(
        "Set-Cookie",
        serializeCookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_SECONDS, secure })
      );
      headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secure));
      headers.append("Set-Cookie", clearCookie(VERIFIER_COOKIE, secure));
      return new Response(null, { status: 302, headers });
    } catch (err) {
      console.error("google login failed", err);
      return redirectToApp(url, "?login=failed", secure);
    }
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const headers = new Headers();
    headers.append("Set-Cookie", clearCookie(SESSION_COOKIE, secure));
    return new Response(null, { status: 204, headers });
  }

  return null;
}

function redirectToApp(url: URL, query: string, secure: boolean): Response {
  const headers = new Headers({ Location: `${url.origin}/${query}` });
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secure));
  headers.append("Set-Cookie", clearCookie(VERIFIER_COOKIE, secure));
  return new Response(null, { status: 302, headers });
}
