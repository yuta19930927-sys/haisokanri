import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { DeliveryManagementApp } from "../delivery-retro-v2.jsx";
const MOBILE_BREAKPOINT = 768;
const FONT_LINK_ID = "noto-sans-jp-font-link";

const useIsMobile = () => {
  const getValue = () =>
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false;
  const [isMobile, setIsMobile] = useState(getValue);
  useEffect(() => {
    const onResize = () => setIsMobile(getValue());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const loginBox = {
  width: "100%",
  maxWidth: "400px",
  background: "#ffffff",
  border: "1px solid #e8e8e8",
  borderRadius: "6px",
  boxShadow: "0 12px 32px rgba(23, 43, 77, 0.08)",
  padding: "24px",
  fontFamily: "'Noto Sans JP', sans-serif",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  marginTop: "4px",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  fontSize: "13px",
  color: "#333",
  background: "#fff",
  outline: "none",
};

const btnStyle = {
  width: "100%",
  marginTop: "14px",
  padding: "10px",
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid #00a09a",
  borderRadius: "4px",
  color: "#fff",
  background: "#00a09a",
  fontFamily: "'Noto Sans JP', sans-serif",
  fontSize: "13px",
};

const tabBtn = (active) => ({
  flex: 1,
  padding: "8px",
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid #d8dce0",
  borderRadius: "4px",
  background: active ? "#00a09a" : "#fff",
  color: active ? "#fff" : "#555",
  fontFamily: "'Noto Sans JP', sans-serif",
  fontSize: "13px",
});

const AUTH_INIT_TIMEOUT_MS = 30000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export default function App() {
  const isMobile = useIsMobile();
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loginRole, setLoginRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement("link");
      link.id = FONT_LINK_ID;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

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

  const resolveSessionProfile = useCallback(
    async (nextSession, { signOutOnMissing = false } = {}) => {
      if (!nextSession?.user) {
        setSession(null);
        setProfile(null);
        return;
      }

      let p = null;
      try {
        p = await loadProfile(nextSession.user.id);
      } catch (profileErr) {
        console.warn("loadProfile failed:", profileErr);
      }

      if (!p) {
        if (signOutOnMissing) {
          try {
            await supabase.auth.signOut();
          } catch (signOutErr) {
            console.warn("signOut after missing profile:", signOutErr);
          }
        }
        setSession(null);
        setProfile(null);
        return;
      }

      setSession(nextSession);
      setProfile(p);
    },
    [loadProfile]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS);
        if (cancelled) return;
        if (res.error) throw res.error;
        const s = res.data?.session ?? null;
        await resolveSessionProfile(s, { signOutOnMissing: true });
      } catch (e) {
        console.warn("getSession failed or timed out:", e);
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      try {
        if (event === "SIGNED_OUT") {
          setSession(null);
          setProfile(null);
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          setSession(s);
          return;
        }

        if (s?.user) {
          await resolveSessionProfile(s, { signOutOnMissing: true });
        } else {
          setSession(null);
          setProfile(null);
        }
      } catch (e) {
        console.warn("onAuthStateChange:", e);
        setSession(null);
        setProfile(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [resolveSessionProfile]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data, error: signErr } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        AUTH_INIT_TIMEOUT_MS
      );
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
      <div style={{ minHeight: "100vh", background: "#f7f8f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans JP', sans-serif" }}>
        <p style={{ color: "#555" }}>認証情報を確認しています…</p>
      </div>
    );
  }

  const authed = session?.user && profile;

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f8f9", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "8px" : "16px", fontFamily: "'Noto Sans JP', sans-serif", fontSize: "13px", fontWeight: 400 }}>
        <div style={{ ...loginBox, maxWidth: isMobile ? "100%" : "380px", padding: isMobile ? "14px" : "20px" }}>
          <div style={{ background: "#00a09a", margin: isMobile ? "-14px -14px 12px -14px" : "-20px -20px 16px -20px", padding: "8px 12px", color: "#fff", fontWeight: 700, fontSize: isMobile ? "12px" : "13px", borderTopLeftRadius: "6px", borderTopRightRadius: "6px" }}>
            T-LINK 配送管理システム
          </div>
          <div style={{ marginBottom: "12px", color: "#555", fontSize: "12px", fontWeight: 500 }}>
            配送管理システム - ログイン
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
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>
              メールアドレス
              <input type="email" autoComplete="username" value={email} onChange={(ev) => setEmail(ev.target.value)} required style={inputStyle} />
            </label>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginTop: "10px" }}>
              パスワード
              <input type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} required style={inputStyle} />
            </label>
            {error && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: "#e63946", fontWeight: 600 }}>{error}</div>
            )}
            <button type="submit" disabled={busy} style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }}>
              {busy ? "ログイン中…" : "ログイン"}
            </button>
          </form>
          <p style={{ marginTop: "14px", fontSize: "11px", color: "#888", lineHeight: 1.5 }}>
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
      isMobile={isMobile}
    />
  );
}
