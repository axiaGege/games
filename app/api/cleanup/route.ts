import { supabase } from "@/lib/supabaseClient";

// 防止被任意调用：若 Vercel 配置了 VERCEL_CRON_SECRET，则只接受带正确 Bearer 的请求。
// 未配置时放行（仅会删除"空房间且超过24小时"的垃圾数据，无副作用）。
export async function GET(req: Request) {
  const secret = process.env.VERCEL_CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // 超过 24 小时的都算"过期"
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("rooms")
    .select("id, players, created_at")
    .lt("created_at", cutoff)
    .limit(1000);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // 判断"空房间"：兼容 players 是数组、JSON 字符串、或 null 的多种存储形态
  const isEmptyPlayers = (p: any): boolean => {
    if (p == null) return true;
    if (Array.isArray(p)) return p.length === 0;
    if (typeof p === "string") {
      const s = p.trim();
      if (s === "" || s === "[]" || s === "null") return true;
      try {
        const a = JSON.parse(s);
        return Array.isArray(a) ? a.length === 0 : true;
      } catch {
        return true;
      }
    }
    return true;
  };

  const toDelete = (data || []).filter((r: any) => isEmptyPlayers(r.players)).map((r: any) => r.id);

  let deleted = 0;
  if (toDelete.length > 0) {
    const del = await supabase.from("rooms").delete().in("id", toDelete);
    if (!del.error) deleted = toDelete.length;
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: data?.length || 0, deleted }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
