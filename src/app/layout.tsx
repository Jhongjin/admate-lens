import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdMate Lens",
  description: "광고 게재 화면과 보고서 증빙을 자동 생성하는 캡처 자동화 솔루션",
  icons: {
    icon: [
      {
        url: "/brand/admate-lens-favicon-02.svg",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
