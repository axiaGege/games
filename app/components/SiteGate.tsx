"use client";

import { useEffect, useState } from "react";

export default function SiteGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "open">("checking");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/gate", { method: "GET" })
      .then((r) => r.json())
      .then((d) => setStatus(d.ok ? "open" : "locked"))
      .catch(() => setStatus("locked"));
  }, []);

  const submit = async () => {
    setErr("");
    if (!pwd.trim()) {
      setErr("请输入口令");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus("open");
      } else {
        setErr("口令错误");
      }
    } catch {
      setErr("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (status === "open") return <>{children}</>;

  if (status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #0f0f1a, #1a1a2e)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.4)",
          fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        载入中…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(30px)",
          borderRadius: 24,
          padding: "36px 28px",
          maxWidth: 360,
          width: "100%",
          border: "1px solid rgba(168,85,247,0.35)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(168,85,247,0.15)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔐</div>
        <h2 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>不醉不归</h2>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "0 0 22px" }}>请输入入场口令</p>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="口令"
          style={{
            width: "100%",
            padding: "12px 16px",
            marginBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color: "#fff",
            fontSize: 15,
            outline: "none",
            boxSizing: "border-box" as const,
          }}
        />
        <button
          onClick={submit}
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            border: "none",
            borderRadius: 12,
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(168,85,247,0.5)",
          }}
        >
          {loading ? "验证中…" : "进入"}
        </button>
        {err && <div style={{ color: "#f87171", marginTop: 12, fontSize: 14 }}>{err}</div>}
      </div>
    </div>
  );
}
