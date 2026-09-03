const REALM = "sleep-diary";

/**
 * デプロイ先全体にかける Basic 認証。公開前の目隠しであって、
 * アプリのユーザー認証ではない。
 *
 * 通ってよければ null を、そうでなければ返すべき Response を返す。
 */
export async function checkBasicAuth(request: Request, env: Env): Promise<Response | null> {
  // 設定漏れでサイト全体が素通しになるほうが困るので、未設定なら閉じる。
  if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASSWORD) {
    return new Response("Basic auth is not configured", { status: 503 });
  }

  const credentials = readCredentials(request);
  if (!credentials) return unauthorized();

  const ok = await equals(
    `${credentials.user}:${credentials.password}`,
    `${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASSWORD}`
  );
  return ok ? null : unauthorized();
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      // 認証前の応答をどこにも残さない
      "Cache-Control": "no-store",
    },
  });
}

function readCredentials(request: Request): { user: string; password: string } | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;

  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // 日本語などを含むパスワードでも壊れないよう UTF-8 として読む
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }

  // パスワードに ':' が入りうるので、最初の 1 つだけで区切る。
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * 一致するかどうかだけが漏れるように、ダイジェストを取ってから全バイトを比較する。
 * 先頭何文字が合っていたかが応答時間に出ないようにするため。
 */
async function equals(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
