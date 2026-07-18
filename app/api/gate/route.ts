import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ok = req.cookies.get("site_unlocked")?.value === "1";
  return NextResponse.json({ ok });
}

export async function POST(req: NextRequest) {
  const pwd = process.env.SITE_PASSWORD;
  let entered = "";
  try {
    const b = await req.json();
    entered = (b.password || "").toString();
  } catch {
    // ignore
  }

  const mk = (ok: boolean, status = 200) => {
    const res = NextResponse.json({ ok }, { status });
    if (ok) {
      res.cookies.set("site_unlocked", "1", {
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
        sameSite: "lax",
      });
    }
    return res;
  };

  if (!pwd) {
    console.warn("[gate] SITE_PASSWORD 未配置，口令门处于关闭（开放）状态");
    return mk(true);
  }
  if (entered === pwd) return mk(true);
  return mk(false, 401);
}
