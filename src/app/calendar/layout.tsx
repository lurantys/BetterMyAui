import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jenzabar+ | Schedule",
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
