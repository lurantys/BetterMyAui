import { AdvisorChat } from "@/components/advisor-chat";
import { NavBar } from "@/components/nav-bar";

export default function AdvisorPage() {
  return (
    <main className="flex min-h-screen bg-background">
      <NavBar active="/advisor" />
      <AdvisorChat />
    </main>
  );
}
