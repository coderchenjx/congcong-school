import type { Metadata, Viewport } from "next";
import { AccountGate } from "@/components/AccountGate";
import { Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toast";
import { DailyRewardWatcher } from "@/components/DailyRewardWatcher";
import { AchievementWatcher } from "@/components/AchievementWatcher";
import { IntroAudioUnlock } from "@/components/IntroAudioUnlock";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "聪聪学堂",
  description: "全科免费，人人可学的小学AI学习平台",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "聪聪学堂",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#58CC02" },
    { media: "(prefers-color-scheme: dark)", color: "#131F24" },
  ],
};

/**
 * 登录前只跟随系统主题；登录后 ThemeProvider 应用账号的服务端偏好。
 * 顺带注册 Service Worker（壳层预缓存 + 课程 JSON/音频 SWR）。
 */
const bootScript = `
(function () {
  try {
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (sysDark) {
      var root = document.documentElement;
      root.classList.add("theme-dark");
      root.style.colorScheme = "dark";
      root.style.backgroundColor = "#131F24";
    }
  } catch (e) {}
  if ("serviceWorker" in navigator && ${process.env.NODE_ENV === "production"}) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={nunito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      {/* 底部导航的高度补偿由 BottomNav 自带的占位条负责（web-lesson-15）：
          课程 / 阅读器等沉浸页导航隐藏时不再留 64px 死空隙 */}
      <body className="min-h-screen bg-bg">
        <AccountGate>
          <ThemeProvider>
            <ToastProvider>
              <DailyRewardWatcher />
              <AchievementWatcher />
              <IntroAudioUnlock />
              {children}
              <BottomNav />
            </ToastProvider>
          </ThemeProvider>
        </AccountGate>
      </body>
    </html>
  );
}
