import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers/Providers";
import { AppShell } from "@/components/layout/AppShell";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "קבוצת חקיקת — ניהול נדל\"ן מניב",
  description: "מערכת ניהול נדל\"ן מניב עבור קבוצת חקיקת",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.className}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
