import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BetterJenzabar | Catalog",
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
