"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Trophy, Lightning } from "@/components/icons";
import { loadLeaderboard } from "@/lib/leaderboard";
import { cn } from "@/lib/cn";

type Board = Awaited<ReturnType<typeof loadLeaderboard>>;

export default function LeaguePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    let busy = false;
    async function load() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      setLoading(true);
      try {
        const next = await loadLeaderboard();
        if (active) { setBoard(next); setError(""); }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "排行榜加载失败，请重试");
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    }
    void load();
    // 浏览页面时每 30 秒更新；切回页面立即刷新。
    const timer = window.setInterval(() => { void load(); }, 30_000);
    const onVisible = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  return <AppShell>
    <main className="min-h-screen bg-bg lg:bg-transparent px-4 pt-6 lg:px-0 lg:pt-0 pb-8">
      <PageHeader backHref={null} title="排行榜" subtitle="和真实用户比一比" />
      <div className="max-w-md lg:max-w-none mx-auto pt-4 space-y-4">
        <section className="ui-card rounded-2xl border-2 border-bg-softer bg-white p-5">
          <div className="flex items-center gap-3">
            <Trophy className="w-10 h-10 text-primary" />
            <div className="flex-1"><h2 className="font-extrabold text-ink">本周 XP 排行榜</h2>
              <p className="text-sm text-ink-light mt-1">{board ? `${board.weekStart} 至 ${board.weekEnd} · ${board.rows.length} 位用户` : "正在读取本周排名"}</p></div>
            <button type="button" className="btn-chunky-ghost text-sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
              {loading ? "刷新中…" : "刷新"}
            </button>
          </div>
          <p className="text-sm text-ink-light mt-4">按北京时间每周一开始统计，汇总账号下所有孩子的本周 XP。同分并列，未获得 XP 的账号也会列出。</p>
        </section>
        {error && <p role="alert" className="text-danger font-bold">{error}。请点击刷新重试。{board && "下方保留上次成功加载的排名。"}</p>}
        {!board && !error && <p role="status" className="text-ink-light py-8 text-center">正在加载排行榜…</p>}
        {board && <section aria-label="本周用户排名" aria-busy={loading} className="ui-card rounded-2xl border-2 border-bg-softer bg-white overflow-hidden">
          <table className="w-full text-left">
            <thead><tr className="text-sm text-ink-light border-b border-bg-softer">
              <th scope="col" className="p-4">排名</th><th scope="col" className="py-4">用户</th><th scope="col" className="p-4 text-right">本周 XP</th>
            </tr></thead>
            <tbody>{board.rows.map(row => {
              const isMe = row.username === board.username;
              return <tr key={row.username} className={cn("border-b border-bg-softer last:border-0", isMe && "bg-secondary/10")}>
                <td className="p-4 font-extrabold text-ink tabular-nums">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : null} {row.rank}</td>
                <th scope="row" className="py-4 font-extrabold text-ink break-all">{row.username}{isMe && <span className="ml-2 text-xs text-secondary-dark">（你）</span>}</th>
                <td className="p-4 text-right font-extrabold text-primary-dark tabular-nums whitespace-nowrap"><Lightning className="inline w-4 h-4 mr-1" />{row.xp}</td>
              </tr>;
            })}</tbody>
          </table>
        </section>}
        <p className="text-xs text-ink-light">排名依据服务端已保存的学习记录，每 30 秒自动刷新。本榜展示用户名和周 XP，不发放模拟联赛奖励。</p>
      </div>
    </main>
  </AppShell>;
}
