"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";

type Delivery = { configured: boolean; lastSentAt: number | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}

export function AdminDelivery() {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => setDelivery(await api<Delivery>("/api/delivery"));
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().catch((error) => setMessage(error.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const send = async () => {
    setBusy(true); setMessage("");
    try {
      await api("/api/digest/today");
      const result = await api<{ count?: number; skipped?: boolean; message?: string }>("/api/delivery/send", { method: "POST" });
      setMessage(result.skipped ? result.message || "今天已经发送" : `已发送 ${result.count} 张知识卡片。`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "发送失败"); }
    finally { setBusy(false); }
  };
  return <section className="admin-maintenance" aria-label="知识卡片飞书推送">
    <div className="admin-maintenance-head"><span>KNOWLEDGE CARDS · 飞书推送</span><h2>每日知识卡片</h2><p>每天 09:00（北京时间）自动发送到飞书群。</p></div>
    {message && <p className="admin-maintenance-message" role="status">{message}</p>}
    <div className="admin-maintenance-panel">
      <h3><Send size={18} /> 飞书群机器人</h3>
      <p>每次 1–3 张卡片；同一天只发送一次。电脑需要在发送时开机并联网。</p>
      <p className="admin-maintenance-hint">{delivery?.configured ? "飞书机器人已配置。" : "待配置飞书机器人 Webhook。"}{delivery?.lastSentAt ? ` 上次发送：${new Date(delivery.lastSentAt).toLocaleString("zh-CN")}` : " 尚无发送记录。"}</p>
      <div className="admin-maintenance-actions"><button disabled={busy || !delivery?.configured} onClick={() => void send()}>立即发送到飞书</button></div>
    </div>
  </section>;
}
