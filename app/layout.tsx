import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "「不怕吃灰」收藏夹",
  description: "把分散的收藏整理成自己的本地目录。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
