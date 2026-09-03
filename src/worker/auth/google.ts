import { decodeBase64Url, decodeJson, encodeBase64Url } from "../lib/base64url.js";
import type { SessionUser } from "./session.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function redirectUri(url: URL): string {
  return `${url.origin}/api/auth/callback`;
}

/** PKCE の code_verifier と、それに対応する code_challenge を作る。 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: encodeBase64Url(digest) };
}

export function authorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      code_verifier: params.codeVerifier,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`token endpoint returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("token endpoint returned no id_token");
  return body.id_token;
}

type Jwk = JsonWebKey & { kid: string };
let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function fetchJwk(kid: string): Promise<Jwk | undefined> {
  const now = Date.now();
  if (!jwksCache || jwksCache.expiresAt < now) {
    const res = await fetch(JWKS_URI);
    if (!res.ok) throw new Error(`jwks endpoint returned ${res.status}`);
    const body = (await res.json()) as { keys: Jwk[] };
    // Cache-Control の max-age に従う。取れなければ 1 時間。
    const maxAge = Number(res.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
    jwksCache = { keys: body.keys, expiresAt: now + maxAge * 1000 };
  }
  return jwksCache.keys.find((key) => key.kid === kid);
}

type IdTokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * ID トークンの署名・発行者・宛先・有効期限を検証し、セッションに載せる情報を返す。
 */
export async function verifyIdToken(idToken: string, clientId: string): Promise<SessionUser> {
  const [headerPart, payloadPart, signaturePart] = idToken.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("malformed id_token");

  const header = decodeJson<{ kid?: string; alg?: string }>(headerPart);
  if (header.alg !== "RS256") throw new Error(`unsupported id_token alg: ${header.alg}`);
  if (!header.kid) throw new Error("id_token has no kid");

  const jwk = await fetchJwk(header.kid);
  if (!jwk) throw new Error("no matching key in Google JWKS");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  );
  if (!valid) throw new Error("id_token signature verification failed");

  const claims = decodeJson<IdTokenClaims>(payloadPart);
  if (!ISSUERS.includes(claims.iss)) throw new Error(`unexpected iss: ${claims.iss}`);
  if (claims.aud !== clientId) throw new Error("unexpected aud");
  if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error("id_token expired");
  if (!claims.email || claims.email_verified === false) throw new Error("email is not verified");

  return {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
    picture: claims.picture,
  };
}
