import { accountStorage, getAccountSnapshot } from "./accountStorage";

/** Each loaded tab keeps its learner, even when another tab switches learners. */
export interface LearnerProfile { id: string; name: string }
const PROFILES_KEY = "csf-learners-v1";
const ACTIVE_KEY = "csf-active-learner-v1";
const DEFAULT_ID = "default";
const DEFAULT_PROFILE: LearnerProfile = { id: DEFAULT_ID, name: "我的学习档案" };

export function createLearnerProfiles(storage: Pick<Storage, "getItem" | "setItem">,
  session?: Pick<Storage, "getItem" | "setItem">) {
  function list(): LearnerProfile[] {
    const raw = storage.getItem(PROFILES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const profiles = Array.isArray(parsed) ? parsed.filter((p): p is LearnerProfile =>
      !!p && typeof p.id === "string" && /^[a-zA-Z0-9-]+$/.test(p.id) &&
      typeof p.name === "string" && !!p.name.trim()) : [];
    return [profiles.find(p => p.id === DEFAULT_ID) ?? { ...DEFAULT_PROFILE },
      ...profiles.filter((p, i) => p.id !== DEFAULT_ID && profiles.findIndex(q => q.id === p.id) === i)];
  }
  const profiles = list();
  let tabId: string | null = null;
  try { tabId = session?.getItem(ACTIVE_KEY) ?? null; } catch { /* Optional tab storage. */ }
  const requested = tabId ?? storage.getItem(ACTIVE_KEY);
  const activeId = profiles.some(p => p.id === requested) ? requested! : DEFAULT_ID;
  // Pin existing tabs before any other tab changes the last-used learner.
  try { session?.setItem(ACTIVE_KEY, activeId); } catch { session = undefined; }

  function key(base: string) {
    // Preserve all existing progress/reward keys without copying or deleting data.
    return activeId === DEFAULT_ID ? base : `${base}:learner:${activeId}`;
  }
  function cleanName(name: string) {
    const value = name.trim();
    if (!value || value.length > 20) throw new Error("请输入 1–20 个字的名字");
    return value;
  }
  return {
    activeId, key, list,
    create(name: string): LearnerProfile {
      const profile = { id: crypto.randomUUID(), name: cleanName(name) };
      storage.setItem(PROFILES_KEY, JSON.stringify([...list(), profile]));
      return profile;
    },
    rename(name: string) {
      const value = cleanName(name);
      storage.setItem(PROFILES_KEY, JSON.stringify(list().map(p => p.id === activeId ? { ...p, name: value } : p)));
    },
    prepareSwitch(id: string) {
      if (!list().some(p => p.id === id)) throw new Error("找不到这个学习档案，请刷新后重试");
      storage.setItem(ACTIVE_KEY, id);
      session?.setItem(ACTIVE_KEY, id);
      // The current page keeps its original key until a full navigation resets
      // stores, achievement caches, timers and any unfinished lesson components.
    },
  };
}

let client: ReturnType<typeof createLearnerProfiles> | undefined;
export function learnerProfiles() {
  if (!client) {
    const prefix = `csf-account:${getAccountSnapshot().username}:`;
    const session = {
      getItem: (key: string) => window.sessionStorage.getItem(prefix + key),
      setItem: (key: string, value: string) => window.sessionStorage.setItem(prefix + key, value),
    };
    client = createLearnerProfiles(accountStorage, session);
  }
  return client;
}

export function learnerStorageKey(base: string): string {
  if (typeof window === "undefined") return base;
  try { return learnerProfiles().key(base); }
  catch { return base; } // Single-learner mode remains usable with restricted storage.
}

/** All account data follows the current tab's learner. */
export const learnerLocalStorage = {
  getItem(base: string) { return accountStorage.getItem(learnerStorageKey(base)); },
  setItem(base: string, value: string) { accountStorage.setItem(learnerStorageKey(base), value); },
  removeItem(base: string) { accountStorage.removeItem(learnerStorageKey(base)); },
};
// Reading/review drafts also follow the account across browser sessions/devices.
export const learnerSessionStorage = learnerLocalStorage;
