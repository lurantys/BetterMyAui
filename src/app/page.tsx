import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { CalendarDays, BookOpen, LayoutGrid, ArrowRight } from "lucide-react";

export default async function Home() {
  let user = null;
  try {
    const supabase = await createClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {}

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Nav */}
      <header className="flex items-center justify-end px-6 py-4">
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <a
              href="/calendar"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Open app
            </a>
          ) : (
            <>
              <a
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get started
              </a>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <div className="flex flex-col items-center text-center max-w-2xl">
          <img src="/logoaui.png" alt="" className="h-24 w-auto mb-8" />
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Plan your semesters.
            <br />
            <span className="text-primary">Track your progress.</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-md leading-relaxed">
            Schedule courses, check prerequisites, and monitor your GPA — all in one place built for AUI students.
          </p>
          <div className="mt-8 flex items-center gap-3">
            {user ? (
              <a
                href="/calendar"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Go to dashboard
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <>
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Create free account
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Sign in
                </a>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="mt-20 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<CalendarDays className="h-5 w-5" />}
            title="Schedule"
            description="Build your weekly timetable with drag-and-drop. Detect conflicts before they happen."
          />
          <FeatureCard
            icon={<BookOpen className="h-5 w-5" />}
            title="Catalog"
            description="Browse every AUI course. Search by code, name, or discipline with instant results."
          />
          <FeatureCard
            icon={<LayoutGrid className="h-5 w-5" />}
            title="My Career"
            description="Track completed courses, assign grades, and watch your GPA update in real time."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        Built for Al Akhawayn University students
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-left">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
