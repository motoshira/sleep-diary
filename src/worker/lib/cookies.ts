export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

type CookieOptions = {
  maxAge: number;
  secure: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite ?? "Lax"}`,
    `Max-Age=${options.maxAge}`,
  ];
  // ローカルの http://localhost では Secure 付きの Cookie が保存されないため、
  // https のときだけ付ける。
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", { maxAge: 0, secure });
}
