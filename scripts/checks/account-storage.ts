import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Fresh module instances model independent tabs with controlled HTTP failures.
function tab() {
  const module = { exports: {} };
  let server = { username: "alice", revision: 0, data: {} as Record<string, string> };
  let fail = false;
  let onPut: (() => void) | undefined;
  let beforePut: (() => Promise<void>) | undefined;
  const calls: { path: string; options: RequestInit }[] = [];
  const fetch = async (path: string, options: RequestInit) => {
    calls.push({ path, options });
    if (fail) throw new Error("offline");
    if (options.method === "PUT") {
      const body = JSON.parse(String(options.body));
      await beforePut?.();
      onPut?.(); onPut = undefined;
      if (body.revision !== server.revision) return { ok: false, status: 409, json: async () => ({ error: "conflict" }) };
      server = { ...server, revision: server.revision + 1, data: body.data };
      return { ok: true, json: async () => ({ revision: server.revision }) };
    }
    return { ok: true, json: async () => structuredClone(server) };
  };
  const code = ts.transpileModule(readFileSync("apps/web/src/lib/accountStorage.ts", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("exports", "fetch", "setTimeout", "clearTimeout", code)(module.exports, fetch, () => 1, () => {});
  const storage = module.exports as typeof import("../../apps/web/src/lib/accountStorage");
  return { storage, calls, fail: (value: boolean) => { fail = value; },
    conflict: () => { server.revision++; }, onPut: (callback: () => void) => { onPut = callback; },
    beforePut: (callback: () => Promise<void>) => { beforePut = callback; }, server: () => server };
}

async function main() {
const a = tab();
a.storage.accountStorage.setItem("csf-progress-v1", "anonymous");
assert.equal(a.storage.accountStorage.getItem("csf-progress-v1"), null, "no anonymous persistence before login");
await a.storage.loadAccount();
assert.equal(a.storage.getAccountSnapshot().username, "alice");
a.storage.accountStorage.setItem("csf-progress-v1", "progress");
assert.equal(a.storage.hasUnsavedAccount(), true);
await a.storage.flushAccount();
assert.equal(a.server().data["csf-progress-v1"], "progress");
assert.equal(a.storage.getAccountSnapshot().status, "saved");
assert.equal(a.storage.hasUnsavedAccount(), false);
assert.equal((a.calls.at(-1)?.options.headers as Record<string, string>)["X-CSF-User"], "alice");
a.storage.accountStorage.setItem("csf-theme-mode", "dark");
a.onPut(() => a.storage.accountStorage.setItem("csf-theme-mode", "light"));
await a.storage.flushAccount();
assert.equal(a.server().data["csf-theme-mode"], "light", "a change during a save must also reach the server");
a.fail(true);
a.storage.accountStorage.setItem("csf-progress-v1", "unsaved-progress");
await assert.rejects(a.storage.flushAccount(), /offline/);
assert.equal(a.storage.getAccountSnapshot().status, "error");
assert.equal(a.storage.accountStorage.getItem("csf-progress-v1"), "unsaved-progress");
a.fail(false); await a.storage.flushAccount();
assert.equal(a.server().data["csf-progress-v1"], "unsaved-progress");
a.conflict();
a.storage.accountStorage.setItem("csf-progress-v1", "older-tab");
await assert.rejects(a.storage.flushAccount(), /conflict/);
assert.equal(a.storage.getAccountSnapshot().status, "conflict");
assert.equal(a.server().data["csf-progress-v1"], "unsaved-progress");
const callsBefore = a.calls.length;
await assert.rejects(a.storage.flushAccount());
assert.equal(a.calls.length, callsBefore, "conflicts must not silently retry over newer data");

// A navigation/exit awaiting a save must wait for edits queued during that save too.
const b = tab();
await b.storage.loadAccount();
const releases: (() => void)[] = [];
b.beforePut(() => new Promise<void>(resolve => { releases.push(resolve); }));
b.storage.accountStorage.setItem("csf-progress-v1", "first");
let firstDone = false, secondDone = false;
const firstSave = b.storage.flushAccount().then(() => { firstDone = true; });
b.storage.accountStorage.setItem("csf-progress-v1", "second");
const secondSave = b.storage.flushAccount().then(() => { secondDone = true; });
releases[0]();
await new Promise(resolve => setImmediate(resolve));
assert.equal(releases.length, 2);
assert.equal(firstDone, false);
assert.equal(secondDone, false);
releases[1]();
await Promise.all([firstSave, secondSave]);
assert.equal(b.server().data["csf-progress-v1"], "second");
console.log("PASS account storage: authenticated bootstrap, save serialization, in-flight changes, network recovery and conflict protection");
}
void main();
