import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BetterJenzabar | My Career",
};

export default function GpaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
