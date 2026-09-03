/** ログイン中のユーザー。未ログインなら null。 */
export async function fetchCurrentUser() {
  const res = await fetch("/api/me", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me returned ${res.status}`);
  const body = await res.json();
  return body.user;
}

export function startLogin() {
  window.location.href = "/api/auth/login";
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.href = "/";
}
