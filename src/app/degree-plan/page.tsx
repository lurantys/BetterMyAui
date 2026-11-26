"use client";

import { startTransition, useEffect, useState } from "react";
import { DegreePlanPanel } from "@/components/degree-plan-panel";
import { NavBar } from "@/components/nav-bar";
import { loadPastSchedules, loadProfile, loadSchedules, onStorageChange, saveProfile, saveSchedules } from "@/lib/store";

function readCareer() {
  return { profile: loadProfile(), calendar: loadSchedules(), past: loadPastSchedules() };
}

export default function DegreePlanPage() {
  const [career, setCareer] = useState<ReturnType<typeof readCareer> | null>(null);

  useEffect(() => {
    const refresh = () => setCareer(readCareer());
    startTransition(refresh);
    return onStorageChange(refresh);
  }, []);

  return (
    <div className="mobile-app-shell flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavBar active="/degree-plan" />
        <main className="motion-page min-w-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-8 sm:py-8">
            <h1 className="mb-6 text-2xl sm:text-3xl font-semibold tracking-[-0.025em]">Degree Plan</h1>
            {career ? (
              <DegreePlanPanel key={career.profile?.major ?? ""} major={career.profile?.major ?? ""}
                minor={career.profile?.minor} specialization={career.profile?.specialization ?? ""}
                calendar={career.calendar} past={career.past}
                onSpecializationChange={(specialization) => {
                  const profile = loadProfile();
                  if (!profile) return;
                  saveProfile({ ...profile, specialization: specialization || undefined });
                  setCareer(readCareer());
                }}
                onSave={(schedules) => {
                  saveSchedules(schedules);
                  setCareer(readCareer());
                }}
              />
            ) : <p className="text-sm text-muted-foreground" role="status">Loading degree plan…</p>}
          </div>
        </main>
      </div>
    </div>
  );
}
