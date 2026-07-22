import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BetterJenzabar | Schedule",
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
