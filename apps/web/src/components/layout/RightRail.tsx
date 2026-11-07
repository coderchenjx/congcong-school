"use client";

/**
 * RightRail —— 桌面端右侧 rail（仿 Duolingo web）
 *
 * 顺序：StatsBar HUD / 续学或排行榜入口 / DailyQuestsPanel
 * 每日目标环继续留在 profile；rail 上的目标卡已被「每日任务卡」取代。
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ContinueLearningCard } from "@/components/ContinueLearningCard";
import { StatsBar } from "@/components/StatsBar";
import { DailyQuestsPanel } from "@/components/DailyQuestsPanel";
import { useProgressStore } from "@/store/progress";
import { Trophy } from "@/components/LearningIcon";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function RightRail() {
  const pathname = usePathname();
  return (
    <div className="flex min-w-0 flex-col gap-5 w-full">
      <div className="flex justify-end">
        <StatsBar compact placement="rail" />
      </div>
      {pathname?.startsWith("/book/") && <ContinueLearningCard compact placement="rail" />}
      {!pathname?.startsWith("/league") && <LearningNextStep />}
      <DailyQuestsPanel />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border-2 border-bg-softer bg-white p-5"
    >
      {children}
    </div>
  );
}

function LeaderboardTeaserCard() {
  return <Link href="/league/" onClick={() => { playSfx("tap"); haptic("light"); }} className="block">
    <CardShell><div className="flex items-center gap-3">
      <Trophy className="w-8 h-8 text-primary" />
      <div><p className="font-extrabold text-ink">本周用户排行榜</p>
        <p className="text-sm text-ink-light mt-1">和真实用户比一比本周 XP</p></div>
      <span className="ml-auto text-ink-softer" aria-hidden>→</span>
    </div></CardShell>
  </Link>;
}

function LearningNextStep() {
  const grade = useProgressStore(s => s.selectedGrade) ?? 1;
  const completed = useProgressStore(s => Object.keys(s.completedLessons).length);
  // 学满 10 节课后，侧栏从故事推荐切换为排行榜入口。
  if (completed >= 10) return <LeaderboardTeaserCard />;
  return <CardShell><p className="font-extrabold text-ink">和聪聪读一读</p><p className="text-sm text-ink-light mt-2">听一个故事，发现课本之外的新世界。</p><Link href={`/stories/chinese-g${grade}up/`} className="inline-flex min-h-11 items-center text-secondary-dark font-bold mt-2">去听故事 →</Link></CardShell>;
}
