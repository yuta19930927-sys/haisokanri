import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { DeliveryManagementApp, HakomaneLogo } from "../delivery-retro-v2.jsx";
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

// Supabase のログイン・パスワード関係のエラーは英語で返ってくるため、
// 何が原因で、どうすればよいかが分かる日本語に置き換える。
const CHAR_CLASS_LABELS = [
  [/abcdefghijklmnopqrstuvwxyz/, "英小文字（a〜z）"],
  [/ABCDEFGHIJKLMNOPQRSTUVWXYZ/, "英大文字（A〜Z）"],
  [/0123456789/, "数字（0〜9）"],
  [/[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]{5,}/, "記号（!や#など）"],
];
const toJapaneseAuthError = (err) => {
  const code = err?.code || "";
  const msg = String(err?.message || err || "");
  const reasons = Array.isArray(err?.reasons) ? err.reasons : [];
  if (code === "same_password" || /different from the old password/i.test(msg)) {
    return "今までと同じパスワードは使えません。別のパスワードを入力してください。";
  }
  if (code === "weak_password" || /password should/i.test(msg) || reasons.length) {
    const parts = [];
    const len = msg.match(/at least (\d+) characters/i);
    if (reasons.includes("length") || len) parts.push(`${len ? len[1] : "決められた"}文字以上にしてください。`);
    if (reasons.includes("characters") || /contain at least one character of each/i.test(msg)) {
      const need = CHAR_CLASS_LABELS.filter(([re]) => re.test(msg)).map(([, label]) => label);
      parts.push(need.length ? `${need.join("・")}をそれぞれ1文字以上入れてください。` : "英大文字・英小文字・数字・記号を組み合わせてください。");
    }
    if (reasons.includes("pwned") || /pwned|leaked|compromised|known to be weak|easy to guess/i.test(msg)) {
      parts.push("過去に流出したことのある、よく使われるパスワードのため使えません。別のパスワードにしてください。");
    }
    return `このパスワードは使えません。${parts.length ? parts.join("") : "もっと長く、推測されにくいパスワードにしてください。"}`;
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return "メールアドレスまたはパスワードが違います。パスワードを忘れた場合は、下の「パスワードを忘れた場合はこちら」から再設定してください。";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) {
    return "メールアドレスの確認がまだ終わっていません。届いている確認メールのリンクを開いてから、もう一度ログインしてください。";
  }
  if (/rate limit|too many requests|for security purposes, you can only request this after/i.test(msg) || /over_(email_send|request)_rate_limit/.test(code)) {
    const sec = msg.match(/after (\d+) seconds/i);
    return sec
      ? `短い時間に続けて操作されたため、いったん止めています。${sec[1]}秒ほど待ってから、もう一度お試しください。`
      : "短い時間に何度も操作されたため、いったん止めています。しばらく（数分〜1時間ほど）待ってから、もう一度お試しください。";
  }
  if (code === "session_not_found" || code === "otp_expired" || /auth session missing|session.*(expired|not found)|link is invalid or has expired|token has expired/i.test(msg)) {
    return "再設定用のリンクの有効期限が切れたか、すでに使われています。ログイン画面の「パスワードを忘れた場合はこちら」から、もう一度再設定メールを送ってください。";
  }
  if (code === "email_address_invalid" || /unable to validate email address|invalid email/i.test(msg)) {
    return "メールアドレスの形が正しくありません。入力をご確認ください。";
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return "サーバーにつながりませんでした。インターネットの接続を確認してから、もう一度お試しください。";
  }
  // 想定外のエラーは、原因を調べられるよう元の英語も添える
  return `エラーが発生しました。もう一度お試しください。（詳細：${msg}）`;
};

const ResetPasswordPage = ({ onComplete }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleReset = async () => {
    setError(null);
    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(toJapaneseAuthError(updateErr));
    } else {
      alert("パスワードを設定しました！ログインしてください。");
      onComplete();
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f5f5",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "40px",
          width: "400px",
          maxWidth: "calc(100vw - 24px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: "#00a09a",
            margin: "-40px -40px 24px",
            padding: "20px 40px",
            borderRadius: "12px 12px 0 0",
            color: "#fff",
            fontSize: "16px",
            fontWeight: 700,
          }}
        >
          ハコマネ - パスワード設定
        </div>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "20px", lineHeight: 1.6 }}>
          新しいパスワードを設定してください（8文字以上。英大文字・英小文字・数字・記号を混ぜると安全です）
        </p>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#333", display: "block" }}>
            新しいパスワード
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8文字以上"
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "14px",
              marginTop: "4px",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#333", display: "block" }}>
            パスワード確認
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="もう一度入力"
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "14px",
              marginTop: "4px",
              boxSizing: "border-box",
            }}
          />
        </div>
        {error && (
          <p style={{ color: "#e53935", fontSize: "12px", marginBottom: "12px" }}>{error}</p>
        )}
        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            background: "#00a09a",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          {loading ? "設定中..." : "パスワードを設定する"}
        </button>
      </div>
    </div>
  );
};

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
  const [showResetPassword, setShowResetPassword] = useState(false);
  // 「パスワードを忘れた場合」の画面（再設定メールを送る）
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const syncProfile = async (s) => {
      if (!s?.user) {
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
        return;
      }
      const p = await loadProfile(s.user.id);
      if (cancelled) return;
      if (!p) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
        return;
      }
      setSession(s);
      setProfile(p);
    };

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn(error);
        setSession(null);
        setProfile(null);
      } else {
        await syncProfile(session);
      }
      if (!cancelled) setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && !cancelled) {
        setShowResetPassword(true);
      }
      void syncProfile(session).catch((e) => {
        console.warn("onAuthStateChange:", e);
        if (!cancelled) {
          setSession(null);
          setProfile(null);
        }
      });
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
      const adminTabOk =
        loginRole === "admin" && (p.role === "admin" || p.role === "super_admin");
      const driverTabOk = loginRole === "driver" && p.role === loginRole;
      if (!adminTabOk && !driverTabOk) {
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
      setError(toJapaneseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSendReset = async (e) => {
    e.preventDefault();
    setError("");
    const addr = email.trim();
    if (!addr) {
      setError("ログインに使っているメールアドレスを入力してください。");
      return;
    }
    setBusy(true);
    try {
      // メールのリンクから戻る先は、今開いているハコマネ（本番・検証どちらでも同じ画面に戻る）
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: typeof window !== "undefined" ? window.location.origin : "https://haisokanri.vercel.app",
      });
      if (resetErr) throw resetErr;
      setForgotSent(true);
    } catch (err) {
      setError(toJapaneseAuthError(err));
    } finally {
      setBusy(false);
    }
  };
  const openForgot = () => { setForgotMode(true); setForgotSent(false); setError(""); setPassword(""); };
  const closeForgot = () => { setForgotMode(false); setForgotSent(false); setError(""); };

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

  if (showResetPassword) {
    return (
      <ResetPasswordPage
        onComplete={() => {
          setShowResetPassword(false);
          void supabase.auth.signOut();
        }}
      />
    );
  }

  const authed = session?.user && profile;

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#f7f8f9", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "8px" : "16px", fontFamily: "'Noto Sans JP', sans-serif", fontSize: "13px", fontWeight: 400 }}>
        <div style={{ ...loginBox, maxWidth: isMobile ? "100%" : "380px" }}>
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "16px" }}>
            <HakomaneLogo height={44} />
          </div>
          <div style={{ marginBottom: "12px", color: "#555", fontSize: "12px", fontWeight: 500 }}>
            配送管理システム - ログイン
          </div>
          {forgotMode ? (
            <form onSubmit={handleSendReset}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#333", marginBottom: "6px" }}>パスワードの再設定</div>
              {forgotSent ? (
                <div style={{ fontSize: "12px", color: "#333", lineHeight: 1.7, background: "#f0fbfa", border: "1px solid #b2dfdb", borderRadius: "4px", padding: "10px 12px" }}>
                  <b>{email.trim()}</b> に、パスワード再設定用のメールを送りました（登録されているメールアドレスの場合のみ届きます）。<br />
                  メールのリンクを開くと、新しいパスワードを設定する画面になります。<br />
                  数分たっても届かない場合は、迷惑メールフォルダもご確認ください。
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "12px", color: "#666", lineHeight: 1.6, margin: "0 0 8px" }}>
                    ログインに使っているメールアドレスを入力してください。パスワードを設定し直すためのメールを送ります。
                  </p>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>
                    メールアドレス
                    <input type="email" autoComplete="username" value={email} onChange={(ev) => setEmail(ev.target.value)} required style={inputStyle} />
                  </label>
                  {error && (
                    <div style={{ marginTop: "10px", fontSize: "12px", color: "#e63946", fontWeight: 600, lineHeight: 1.6 }}>{error}</div>
                  )}
                  <button type="submit" disabled={busy} style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }}>
                    {busy ? "送信中…" : "再設定用のメールを送る"}
                  </button>
                </>
              )}
              <button type="button" onClick={closeForgot} style={{ marginTop: "12px", background: "none", border: "none", color: "#00a09a", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
                ← ログイン画面に戻る
              </button>
            </form>
          ) : (
          <>
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
              <div style={{ marginTop: "10px", fontSize: "12px", color: "#e63946", fontWeight: 600, lineHeight: 1.6 }}>{error}</div>
            )}
            <button type="submit" disabled={busy} style={{ ...btnStyle, opacity: busy ? 0.7 : 1 }}>
              {busy ? "ログイン中…" : "ログイン"}
            </button>
          </form>
          <div style={{ marginTop: "12px", textAlign: "center" }}>
            <button type="button" onClick={openForgot} style={{ background: "none", border: "none", color: "#00a09a", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline", fontFamily: "'Noto Sans JP', sans-serif" }}>
              パスワードを忘れた場合はこちら
            </button>
          </div>
          </>
          )}
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
