import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jenzabar+ | My Career",
};

export default function GpaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
