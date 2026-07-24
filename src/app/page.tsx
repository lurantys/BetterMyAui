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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Ambient glow — behind everything */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl dark:bg-primary/5" />
        <div className="absolute top-1/3 -right-20 h-[300px] w-[400px] rounded-full bg-primary/5 blur-3xl dark:bg-primary/3" />
        <div className="absolute -bottom-20 -left-20 h-[250px] w-[350px] rounded-full bg-primary/4 blur-3xl dark:bg-primary/3" />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <img src="/logoaui.png" alt="" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            BetterJenzabar
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <a
              href="/calendar"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all"
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
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                Get started
              </a>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24">
        <div className="flex flex-col items-center text-center max-w-2xl">
          {/* Logo with ring */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl dark:bg-primary/8" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-lg shadow-black/5 dark:shadow-black/20">
              <img src="/logoaui.png" alt="" className="h-12 w-auto" />
            </div>
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Plan your semesters.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Track your progress.
            </span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-md leading-relaxed">
            Schedule courses, check prerequisites, and monitor your GPA — all in
            one place built for AUI students.
          </p>
          <div className="mt-8 flex items-center gap-3">
            {user ? (
              <a
                href="/calendar"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:bg-primary/90 transition-all"
              >
                Go to dashboard
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <>
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 hover:bg-primary/90 transition-all"
                >
                  Create free account
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="rounded-lg border border-border bg-card/50 px-6 py-3 text-sm font-medium text-foreground hover:bg-accent hover:border-primary/20 transition-all"
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
      <footer className="relative z-10 border-t border-border/60 px-6 py-4 text-center text-xs text-muted-foreground">
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
    <div className="group rounded-xl border border-border bg-card/60 p-5 text-left backdrop-blur-sm transition-all hover:border-primary/20 hover:bg-card hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
