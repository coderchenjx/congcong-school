/** Server-backed Web Storage. Only the authenticated account lives in memory. */
type Status = "loading" | "saved" | "saving" | "error" | "conflict";
interface Snapshot { status: Status; message: string; username: string }
let snapshot: Snapshot = { status: "loading", message: "正在读取服务端存档…", username: "" };
let data: Record<string, string> = {};
let revision = 0;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | undefined;
const listeners = new Set<() => void>();

function update(status: Status, message: string) {
  snapshot = { ...snapshot, status, message };
  listeners.forEach(listener => listener());
}

export const subscribeAccount = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getAccountSnapshot = () => snapshot;

export async function accountRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSF-User": snapshot.username, ...options.headers },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "请求失败";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body;
}

export async function loadAccount() {
  const body = await accountRequest("data");
  if (!body || typeof body !== "object" || !("username" in body) || typeof body.username !== "string" ||
    !("revision" in body) || typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
    !("data" in body) || !body.data || typeof body.data !== "object" || Array.isArray(body.data) ||
    Object.values(body.data).some(value => typeof value !== "string")) throw new Error("服务端存档格式错误");
  // Values have been checked at the HTTP boundary; Object.fromEntries preserves their type.
  data = Object.fromEntries(Object.entries(body.data).map(([key, value]) => [key, String(value)]));
  revision = body.revision;
  snapshot = { username: body.username, status: "saved", message: "已保存到服务端" };
  listeners.forEach(listener => listener());
}

function changed() {
  dirty = true;
  if (snapshot.status === "conflict") return;
  update("saving", "正在保存…");
  clearTimeout(timer);
  // Coalesce frequent answer/timer checkpoints into one request after 400 ms.
  timer = setTimeout(() => { void flushAccount().catch(() => {}); }, 400);
}

export const accountStorage = {
  getItem(key: string) { return data[key] ?? null; },
  setItem(key: string, value: string) {
    if (!snapshot.username) return;
    if (data[key] === value) return;
    data[key] = value;
    changed();
  },
  removeItem(key: string) {
    if (!(key in data)) return;
    delete data[key];
    changed();
  },
};

export function hasUnsavedAccount() { return dirty || !!saving; }

export async function flushAccount(): Promise<void> {
  clearTimeout(timer);
  if (snapshot.status === "conflict") throw new Error(snapshot.message);
  if (saving) { await saving; return flushAccount(); }
  if (!dirty) return;
  dirty = false;
  update("saving", "正在保存…");
  saving = (async () => {
    try {
      const result = await accountRequest("data", { method: "PUT", body: JSON.stringify({ revision, data }) });
      if (!result || typeof result !== "object" || !("revision" in result) || typeof result.revision !== "number" ||
        !Number.isSafeInteger(result.revision) || result.revision !== revision + 1) throw new Error("保存响应格式错误");
      revision = result.revision;
      update(dirty ? "saving" : "saved", dirty ? "正在保存…" : "已保存到服务端");
    } catch (error) {
      dirty = true;
      const conflict = error instanceof Error && "status" in error && (error.status === 409 || error.status === 401);
      update(conflict ? "conflict" : "error", error instanceof Error ? error.message : "保存失败，请检查网络后重试");
      throw error;
    } finally { saving = undefined; }
  })();
  await saving;
  return flushAccount();
}

/** Recovery copy when a network error/conflict prevents saving. */
export function downloadAccountCopy() {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ username: snapshot.username, revision, data }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "congcong-account-recovery.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
