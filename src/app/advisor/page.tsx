import { AdvisorChat } from "@/components/advisor-chat";
import { NavBar } from "@/components/nav-bar";
import type { Viewport } from "next";

export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function AdvisorPage() {
  return (
    <main className="motion-page advisor-page-shell mobile-app-shell flex h-dvh min-w-0 overflow-hidden bg-background">
      <NavBar active="/advisor" />
      <AdvisorChat />
    </main>
  );
}
