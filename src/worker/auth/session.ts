import { decodeBase64Url, decodeJson, encodeBase64Url, encodeJson } from "../lib/base64url.js";

export type SessionUser = {
  /** Google アカウントの sub。テナントの識別子として使う。 */
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

type SessionPayload = SessionUser & { exp: number };

export const SESSION_COOKIE = "sd_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** payload.signature 形式の署名付きトークンを作る。 */
export async function createSessionToken(user: SessionUser, secret: string): Promise<string> {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(body)
  );
  return `${body}.${encodeBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionUser | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      decodeBase64Url(signature),
      new TextEncoder().encode(body)
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = decodeJson<SessionPayload>(body);
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const { exp: _exp, ...user } = payload;
    return user;
  } catch {
    return null;
  }
}
