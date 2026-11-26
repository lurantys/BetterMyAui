import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jenzabar+ | Degree Plan" };

export default function DegreePlanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
