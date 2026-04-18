import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { DeliveryManagementApp } from "../delivery-retro-v2.jsx";

const loginBox = {
  width: "100%",
  maxWidth: "380px",
  background: "#d4d0c8",
  borderTop: "2px solid #fff",
  borderLeft: "2px solid #fff",
  borderBottom: "2px solid #404040",
  borderRight: "2px solid #404040",
  padding: "20px",
  fontFamily: "'MS Gothic','Noto Sans JP',monospace",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  marginTop: "4px",
  borderTop: "2px solid #808080",
  borderLeft: "2px solid #808080",
  borderBottom: "2px solid #fff",
  borderRight: "2px solid #fff",
  fontSize: "14px",
};

const btnStyle = {
  width: "100%",
  marginTop: "14px",
  padding: "10px",
  fontWeight: "bold",
  cursor: "pointer",
  borderTop: "2px solid #fff",
  borderLeft: "2px solid #fff",
  borderBottom: "2px solid #404040",
  borderRight: "2px solid #404040",
  background: "#d4d0c8",
  fontFamily: "'MS Gothic','Noto Sans JP',monospace",
};

const tabBtn = (active) => ({
  flex: 1,
  padding: "8px",
  fontWeight: "bold",
  cursor: "pointer",
  border: "2px solid #808080",
  background: active ? "#000080" : "#c0c0c0",
  color: active ? "#fff" : "#000",
  fontFamily: "'MS Gothic','Noto Sans JP',monospace",
});

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loginRole, setLoginRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    const { data, error: qErr } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();
    if (qErr) {
      console.warn(qErr);
      return null;
    }
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        if (cancelled) return;
        if (!p) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
        } else {
          setSession(s);
          setProfile(p);
        }
      } else {
        setSession(null);
        setProfile(null);
      }
      if (!cancelled) setAuthReady(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (s?.user) {
        const p = await loadProfile(s.user.id);
        if (!p) {
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          return;
        }
        setSession(s);
        setProfile(p);
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) throw signErr;

      const p = await loadProfile(data.user.id);
      if (!p) {
        await supabase.auth.signOut();
        throw new Error("プロフィールがありません。Supabase で profiles を作成してください。");
      }
      if (p.role !== loginRole) {
        await supabase.auth.signOut();
        throw new Error(
          loginRole === "admin"
            ? "このアカウントは管理者用ログインではありません。"
            : "このアカウントはドライバー用ログインではありません。"
        );
      }
      setProfile(p);
      setSession(data.session);
      setPassword("");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", background: "#008080", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <p style={{ color: "#fff" }}>認証情報を確認しています…</p>
      </div>
    );
  }

  const authed = session?.user && profile;

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#008080", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
        <div style={loginBox}>
          <div style={{ background: "linear-gradient(to right,#000080,#1084d0)", margin: "-20px -20px 16px -20px", padding: "8px 12px", color: "#fff", fontWeight: "bold", fontSize: "13px" }}>
            配送管理システム — ログイン
          </div>
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            <button type="button" style={tabBtn(loginRole === "admin")} onClick={() => { setLoginRole("admin"); setError(""); }}>
              管理者
            </button>
            <button type="button" style={tabBtn(loginRole === "driver")} onClick={() => { setLoginRole("driver"); setError(""); }}>
              ドライバー
            </button>
          </div>
          <form onSubmit={handleLogin}>
            <label style={{ fontSize: "12px", fontWeight: "bold" }}>
              メールアドレス
              <input type="email" autoComplete="username" value={email} onChange={(ev) => setEmail(ev.target.value)} required style={inputStyle} />
            </label>
            <label style={{ fontSize: "12px", fontWeight: "bold", display: "block", marginTop: "10px" }}>
              パスワード
              <input type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} required style={inputStyle} />
            </label>
            {error && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: "#c00", fontWeight: "bold" }}>{error}</div>
            )}
            <button type="submit" disabled={busy} style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }}>
              {busy ? "ログイン中…" : "ログイン"}
            </button>
          </form>
          <p style={{ marginTop: "14px", fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
            アカウントは Supabase Auth で作成し、ユーザー metadata に <code>role</code>（<code>admin</code> または <code>driver</code>）を設定してください。初回は SQL のトリガーで <code>profiles</code> に反映されます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <DeliveryManagementApp
      onLogout={handleLogout}
      authRole={profile.role}
      authEmail={profile.email || session.user.email}
    />
  );
}
