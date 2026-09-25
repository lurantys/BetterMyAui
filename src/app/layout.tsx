import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { InlineScript } from "@/components/inline-script";
import { LoadingBar } from "@/components/loading-bar";

export const metadata: Metadata = {
  title: "Jenzabar+",
  description:
    "Track your AUI courses, prerequisites, GPA, and semester plans",
  icons: {
    icon: "/favicon.png",
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
    <html lang="en" suppressHydrationWarning>
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
