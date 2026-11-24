import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { InlineScript } from "@/components/inline-script";
import { LoadingBar } from "@/components/loading-bar";
import { Lato } from "next/font/google";
import { Figtree } from "next/font/google";

const lato = Lato({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
  display: "swap",
});
const figtree = Figtree({
  subsets: ["latin", "latin-ext"],
  weight: ["800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jenzabar+",
  description:
    "Track your AUI courses, prerequisites, GPA, and semester plans",
  icons: {
    icon: "/assets/brand/favicon.png",
  },
};

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    var d = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch(e) {}
})()
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lato.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-background text-foreground font-sans antialiased">
        <ThemeProvider>
          <LoadingBar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
