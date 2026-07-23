import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // 这些游戏不使用 Supabase 登录，关闭会话存储，避免在受限窗口(预览面板/夸克/无痕严格模式)
  // 里探测 localStorage/sessionStorage 时抛 "Access is denied" 报错。不影响实时同步与匿名读写。
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
