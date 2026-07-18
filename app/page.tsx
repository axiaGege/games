import Link from "next/link";

const games = [
  { name: "067 骰子", icon: "🎲", desc: "经典大话骰，聚会必备", route: "/game/067", theme: "g067" },
  { name: "炸金花", icon: "🃏", desc: "三人扑克，比牌运气", route: "/game/zjh", theme: "gzjh" },
  { name: "21点黑杰克", icon: "🂡", desc: "接近21点，不许超", route: "/game/blackjack", theme: "gbj" },
  { name: "天选之子", icon: "🍷", desc: "转盘抽签，天命人喝", route: "/game/chosen", theme: "gtxzz" },
];

const styleCss = `
@keyframes homeFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
.home-icon { font-size:46px; margin-bottom:14px; animation: homeFloat 3s ease-in-out infinite; }
.home-name { color:#fff; font-size:19px; font-weight:800; margin-bottom:6px; }
.home-desc { color:rgba(255,255,255,0.5); font-size:13px; text-align:center; line-height:1.4; }
a[class^="g"] { transition: transform .25s, box-shadow .25s; }

.g067 { background:rgba(236,72,153,0.12); border:1.5px solid rgba(236,72,153,0.5);
  box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 24px rgba(236,72,153,0.25), inset 0 0 18px rgba(168,85,247,0.12); }
.g067:hover { transform:translateY(-8px); box-shadow:0 18px 40px rgba(0,0,0,0.5), 0 0 40px rgba(236,72,153,0.5), inset 0 0 22px rgba(168,85,247,0.2); }
.g067 .home-icon { filter:drop-shadow(0 0 10px rgba(236,72,153,0.9)); }
.g067 .home-name { text-shadow:0 0 10px rgba(236,72,153,0.8); }

.gzjh { background:rgba(251,191,36,0.10); border:1.5px solid rgba(251,191,36,0.5);
  box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 24px rgba(251,191,36,0.22), inset 0 0 18px rgba(245,158,11,0.1); }
.gzjh:hover { transform:translateY(-8px); box-shadow:0 18px 40px rgba(0,0,0,0.5), 0 0 40px rgba(251,191,36,0.45), inset 0 0 22px rgba(245,158,11,0.18); }
.gzjh .home-icon { filter:drop-shadow(0 0 10px rgba(251,191,36,0.9)); }
.gzjh .home-name { text-shadow:0 0 10px rgba(251,191,36,0.8); }

.gbj { background:rgba(240,168,196,0.10); border:1.5px solid rgba(240,168,196,0.5);
  box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 24px rgba(232,121,168,0.22), inset 0 0 18px rgba(240,168,196,0.1); }
.gbj:hover { transform:translateY(-8px); box-shadow:0 18px 40px rgba(0,0,0,0.5), 0 0 40px rgba(232,121,168,0.45), inset 0 0 22px rgba(240,168,196,0.18); }
.gbj .home-icon { filter:drop-shadow(0 0 10px rgba(240,168,196,0.9)); }
.gbj .home-name { text-shadow:0 0 10px rgba(240,168,196,0.8); }

.gtxzz { background:rgba(212,175,55,0.10); border:1.5px solid rgba(212,175,55,0.55);
  box-shadow:0 10px 30px rgba(0,0,0,0.4), 0 0 24px rgba(196,30,58,0.25), inset 0 0 18px rgba(212,175,55,0.1); }
.gtxzz:hover { transform:translateY(-8px); box-shadow:0 18px 40px rgba(0,0,0,0.5), 0 0 40px rgba(212,175,55,0.5), inset 0 0 22px rgba(196,30,58,0.18); }
.gtxzz .home-icon { filter:drop-shadow(0 0 10px rgba(212,175,55,0.9)); }
.gtxzz .home-name { text-shadow:0 0 10px rgba(212,175,55,0.8); }
`;

export default function Home() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <h1 style={{ color: "#fff", fontSize: 36, fontWeight: "bold", marginBottom: 8 }}>🥃 不醉不归</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 40 }}>骰子、扑克、21点——今晚谁先倒？</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, width: "100%", maxWidth: 520 }}>
        {games.map((g) => (
          <Link
            key={g.name}
            href={g.route}
            className={g.theme}
            style={{
              borderRadius: 20,
              padding: "28px 18px 24px",
              textDecoration: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div className="home-icon">{g.icon}</div>
            <div className="home-name">{g.name}</div>
            <div className="home-desc">{g.desc}</div>
          </Link>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: styleCss }} />
    </div>
  );
}
