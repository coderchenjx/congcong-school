import { parseDateKey, weekStartKey, weekDateKeys } from '../packages/core/src/week.ts';

/** One row per configured account; progress is an opaque, user-supplied save. */
export function leaderboard(users, accounts, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const weekStart = weekStartKey(parseDateKey(today));
  const dates = weekDateKeys(weekStart);
  const elapsed = dates.filter(date => date <= today);
  const saved = new Map(accounts.map(account => [account.username, JSON.parse(account.data)]));
  const rows = users.map(({ username }) => {
    let xp = 0;
    for (const [key, value] of Object.entries(saved.get(username) ?? {})) {
      if (!/^csf-progress-v1(?::learner:[a-zA-Z0-9-]+)?$/.test(key)) continue;
      let progress;
      // Invalid imported/old profiles contribute no XP, without hiding other users.
      try { progress = JSON.parse(value); } catch { continue; }
      const history = progress?.state?.xpHistory;
      if (!history || typeof history !== 'object' || Array.isArray(history)) continue;
      for (const date of elapsed) {
        const amount = history[date];
        if (Number.isSafeInteger(amount) && amount >= 0) xp += amount;
      }
    }
    return { username, xp };
  }).sort((a, b) => b.xp - a.xp || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
  let rank = 0;
  return {
    weekStart, weekEnd: dates[6], timeZone: 'Asia/Shanghai',
    rows: rows.map((row, index) => {
      if (index === 0 || row.xp !== rows[index - 1].xp) rank = index + 1;
      return { ...row, rank };
    }),
  };
}
