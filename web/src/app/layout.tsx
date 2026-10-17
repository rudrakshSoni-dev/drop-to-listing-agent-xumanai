import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://drop2list.vercel.app"),
  title: { default: "Drop2List: turn a video into a bookable listing", template: "%s · Drop2List" },
  description:
    "Paste a Reel, TikTok or YouTube link. Drop2List transcribes it, understands the service, checks it for youth-safety risks, and hands you a listing ready to book.",
  openGraph: {
    title: "Drop2List: turn a video into a bookable listing",
    description:
      "Paste a Reel, TikTok or YouTube link. Drop2List transcribes it, understands the service, checks it for youth-safety risks, and hands you a listing ready to book.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drop2List: turn a video into a bookable listing",
    description:
      "Paste a Reel, TikTok or YouTube link. Drop2List transcribes it, understands the service, checks it for youth-safety risks, and hands you a listing ready to book.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 md:px-8">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
