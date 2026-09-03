import { useEffect, useState } from "react";
import SleepDiary from "./SleepDiary.jsx";
import { fetchCurrentUser, logout, startLogin } from "./auth.js";

/** OAuth のコールバックが ?login=failed などを付けて戻ってくる。 */
const loginError = () => {
  const reason = new URLSearchParams(window.location.search).get("login");
  if (reason === "failed") return "ログインできませんでした。もう一度お試しください。";
  if (reason === "cancelled") return "ログインを中止しました。";
  return "";
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [message] = useState(loginError);

  useEffect(() => {
    (async () => {
      try {
        setUser(await fetchCurrentUser());
      } catch {
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return <p className="gate-note">読み込み中…</p>;
  }

  if (!user) {
    return (
      <div className="gate">
        <h1 className="gate-title">睡眠日誌</h1>
        <p className="gate-note">
          起きた朝に、昨夜のことを書き留める。
          <br />
          記録は Google アカウントごとに分かれて保存されます。
        </p>
        {message && <p className="gate-error">{message}</p>}
        <button className="gate-btn" onClick={startLogin}>
          Google でログイン
        </button>
      </div>
    );
  }

  return <SleepDiary user={user} onLogout={logout} />;
}
