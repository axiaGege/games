import Link from "next/link";

const games = [
  { name: "067 骰子", icon: "🎲", desc: "经典大话骰，聚会必备", route: "/game/067", color: "#f43f5e" },
  { name: "炸金花", icon: "🃏", desc: "三人扑克，比牌运气", route: "/game/zjh", color: "#22d3ee" },
  { name: "21点黑杰克", icon: "🂡", desc: "接近21点，不许超", route: "/game/blackjack", color: "#a78bfa" },
  { name: "小姐牌", icon: "💃", desc: "喝酒互动，趣味无限", route: "/game/xjj", color: "#fbbf24" },
];

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
      <h1 style={{ color: "#fff", fontSize: 36, fontWeight: "bold", marginBottom: 8 }}>🎉 聚会游戏厅</h1>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16, marginBottom: 40 }}>选一个游戏，叫朋友一起来玩！</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, width: "100%", maxWidth: 440 }}>
        {games.map((g) => (
          <Link
            key={g.name}
            href={g.route}
            style={{
              background: g.color + "22",
              border: "1px solid " + g.color + "44",
              borderRadius: 20,
              padding: "24px 20px",
              textDecoration: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>{g.icon}</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>{g.name}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{g.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
