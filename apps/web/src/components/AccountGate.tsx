"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { accountRequest, downloadAccountCopy, flushAccount, getAccountSnapshot, hasUnsavedAccount, loadAccount, subscribeAccount } from "@/lib/accountStorage";
import { useProgressStore } from "@/store/progress";

export function AccountGate({ children }: { children: ReactNode }) {
  const account = useSyncExternalStore(subscribeAccount, getAccountSnapshot, getAccountSnapshot);
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const started = useRef(false);

  async function initialize() {
    setPhase("loading"); setError("");
    try {
      await loadAccount();
      await useProgressStore.persist.rehydrate();
      if (!useProgressStore.persist.hasHydrated()) throw new Error("存档无法读取，请联系管理员检查服务器备份");
      setPhase("ready");
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 401) setPhase("login");
      else { setError(error instanceof Error ? error.message : "无法读取存档，请稍后重试"); setPhase("error"); }
    }
  }

  useEffect(() => { if (!started.current) { started.current = true; void initialize(); } }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedAccount()) { event.preventDefault(); event.returnValue = ""; }
    };
    const save = () => { if (hasUnsavedAccount()) void flushAccount().catch(() => {}); };
    const visibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", save);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", save);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await accountRequest("login", { method: "POST", body: JSON.stringify({ username, password }) });
      setPassword("");
      window.location.reload();
    } catch (error) { setError(error instanceof Error ? error.message : "登录失败"); setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError("");
    try {
      await flushAccount();
      await accountRequest("logout", { method: "POST" });
      window.location.assign("/");
    } catch (error) { setError(error instanceof Error ? error.message : "退出失败"); setBusy(false); }
  }

  if (phase === "loading") return <main className="min-h-screen grid place-items-center"><p role="status">正在读取服务端存档…</p></main>;
  if (phase === "error") return <main className="min-h-screen grid place-items-center p-6"><div className="max-w-sm text-center space-y-4">
    <p role="alert">{error}</p><button className="min-h-11 rounded-xl bg-primary px-6 text-white font-bold" onClick={() => void initialize()}>重新连接</button>
  </div></main>;
  if (phase === "login") return <main className="min-h-screen flex items-center justify-center p-6 bg-bg">
    <form onSubmit={login} className="w-full max-w-sm rounded-3xl bg-white border-2 border-bg-softer p-7 space-y-5 shadow-sm">
      <div><p className="text-primary font-bold mb-2">聪聪学堂</p><h1 className="text-2xl font-extrabold text-ink">登录，继续学习</h1>
        <p className="mt-2 text-sm text-ink-light">使用管理员提供的账号登录，学习记录会保存到服务端。</p></div>
      <label className="block text-sm font-bold text-ink">用户名<input required autoComplete="username" maxLength={64} value={username} onChange={event => setUsername(event.target.value)} className="block mt-2 w-full rounded-xl border-2 border-bg-softer min-h-12 px-3" /></label>
      <label className="block text-sm font-bold text-ink">密码<input required type="password" autoComplete="current-password" maxLength={256} value={password} onChange={event => setPassword(event.target.value)} className="block mt-2 w-full rounded-xl border-2 border-bg-softer min-h-12 px-3" /></label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button disabled={busy} className="w-full min-h-12 rounded-xl bg-primary text-white font-extrabold disabled:opacity-50">{busy ? "正在登录…" : "登录"}</button>
      <p className="text-xs text-ink-light">账号由管理员配置。如需账号或重置密码，请联系管理员。</p>
    </form>
  </main>;

  return <>
    <div className="bg-white border-b border-bg-softer px-4 py-2 text-sm text-ink flex flex-wrap items-center justify-between gap-2" aria-label="账号与存档状态">
      <span className="break-all">{account.username} · <span role="status">{account.message}</span></span>
      <div className="flex items-center gap-3">
        {(account.status === "error" || account.status === "conflict") && <>
          {account.status === "error" && <button className="min-h-11 font-bold text-primary" onClick={() => void flushAccount().catch(() => {})}>重试保存</button>}
          <button className="min-h-11 font-bold text-primary" onClick={downloadAccountCopy}>下载未保存记录</button>
          <button className="min-h-11 text-ink-light" onClick={() => window.location.reload()}>刷新读取存档</button>
        </>}
        <button disabled={busy} className="min-h-11 font-bold text-ink-light" onClick={() => void logout()}>退出登录</button>
      </div>
      {error && <p role="alert" className="w-full text-danger">{error}</p>}
    </div>
    {children}
  </>;
}
