import { accountRequest, flushAccount } from "./accountStorage";
import { isDateKey } from "@cstf/core/week";

export async function loadLeaderboard() {
  await flushAccount();
  const body = await accountRequest("leaderboard");
  if (!body || typeof body !== "object" ||
    !("username" in body) || typeof body.username !== "string" ||
    !("weekStart" in body) || typeof body.weekStart !== "string" || !isDateKey(body.weekStart) ||
    !("weekEnd" in body) || typeof body.weekEnd !== "string" || !isDateKey(body.weekEnd) ||
    !("timeZone" in body) || body.timeZone !== "Asia/Shanghai" ||
    !("rows" in body) || !Array.isArray(body.rows)) throw new Error("排行榜响应格式错误");
  const rows = body.rows.map((row: unknown) => {
    if (!row || typeof row !== "object" ||
      !("username" in row) || typeof row.username !== "string" ||
      !("xp" in row) || typeof row.xp !== "number" || !Number.isFinite(row.xp) || row.xp < 0 ||
      !("rank" in row) || typeof row.rank !== "number" || !Number.isSafeInteger(row.rank) || row.rank < 1) {
      throw new Error("排行榜响应格式错误");
    }
    return { username: row.username, xp: row.xp, rank: row.rank };
  });
  return { username: body.username, weekStart: body.weekStart, weekEnd: body.weekEnd, rows };
}
