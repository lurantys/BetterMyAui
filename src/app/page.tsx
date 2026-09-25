import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { CalendarDays, BookOpen, LayoutGrid, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/assets/brand/favicon.png"
            alt="Jenzabar+"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="text-sm font-semibold tracking-[-0.01em]">
            Jenzabar+
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/calendar"
            className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open app
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Academic planning for AUI
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
            Your academic year,
            <br />
            clearly planned.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Build a weekly schedule, check prerequisites, and keep your GPA
            current without leaving your browser.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/calendar"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open schedule
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/catalog"
              className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Browse catalog
            </Link>
          </div>
        </div>

        <div className="mt-24 grid w-full max-w-4xl grid-cols-1 divide-y divide-border/60 border-t border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <FeatureItem
            icon={<CalendarDays className="h-4 w-4" />}
            title="Schedule"
            description="Plan each week and keep prerequisite checks visible."
          />
          <FeatureItem
            icon={<BookOpen className="h-4 w-4" />}
            title="Catalog"
            description="Find AUI courses by code, title, or discipline."
          />
          <FeatureItem
            icon={<LayoutGrid className="h-4 w-4" />}
            title="My Career"
            description="Record completed courses and track cumulative GPA."
          />
        </div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
        Built for Al Akhawayn University students
      </footer>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="py-6 sm:px-6 sm:first:pl-0">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <h2 className="mt-3 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
