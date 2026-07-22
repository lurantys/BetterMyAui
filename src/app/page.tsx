import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-10">
        <a href="/">
          <img src="/logoaui.png" alt="BetterJenzabar" className="h-32 w-auto" />
        </a>

        <nav className="flex flex-col items-center gap-2">
          <a
            href="/calendar"
            className="w-48 rounded-lg border border-border bg-card px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-accent"
          >
            Schedule
          </a>
          <a
            href="/catalog"
            className="w-48 rounded-lg border border-border bg-card px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-accent"
          >
            Catalog
          </a>
          <a
            href="/gpa"
            className="w-48 rounded-lg border border-border bg-card px-4 py-3 text-center text-sm font-medium transition-colors hover:bg-accent"
          >
            My Career
          </a>
        </nav>

        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
