"use client";

import { ScheduleTimeFields } from "@/components/schedule-time-fields";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Bot, Check, LoaderCircle, Mic, Square, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import { calculateCumulativeGpa, calculateGpaTotals, calculateTotalCredits, generateId, getCourseColor, getSemesterStatus, GRADE_OPTIONS, loadPastSchedules, loadProfile, loadSchedules, savePastSchedules, saveProfile, saveSchedules } from "@/lib/store";

interface Message { role: "user" | "assistant"; content: string }
interface ProposedChange { action: "add" | "remove" | "update_meeting" | "set_grade" | "set_major" | "set_minor"; term?: "fall" | "spring" | "summer"; year?: number; code?: string; title?: string; credits?: number; conditionalOn?: string[]; grade?: string; value?: string; daysOfWeek?: number[]; startTime?: string; endTime?: string; location?: string }
interface MinorCandidate { name: string; matchedCourses: number; matchedRequiredCourses: number; evidenceCourses: string[]; confidence: "strong" | "possible" }
interface SpeechResultEvent { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function AdvisorChat({ compact = false, selectedSemester, onSchedulesApplied }: {
  compact?: boolean;
  selectedSemester?: { term: string; year: number };
  onSchedulesApplied?: (schedules: ReturnType<typeof loadSchedules>) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<ProposedChange[] | null>(null);
  const replyContexts = useRef(new WeakMap<Message, string>());
  const proposalContext = useRef<string | null>(null);
  const [minorCandidates, setMinorCandidates] = useState<MinorCandidate[]>([]);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingRequestedRef = useRef(false);
  const commitTranscriptRef = useRef(false);
  const voiceBaseRef = useRef("");
  const voiceTranscriptRef = useRef("");

  function getStudentContext() {
    const profile = loadProfile();
    const planned = loadSchedules();
    const past = loadPastSchedules();
    const currentSemester = planned.find(({ term, year }) => getSemesterStatus(term, year) === "current");
    const { qualityPoints, gradedCredits } = calculateGpaTotals([...past, ...planned]);
    const plannedInProgressCredits = planned.flatMap(({ courses }) => courses).filter((course) => course.grade === null).reduce((sum, course) => sum + course.credits, 0);
    return JSON.stringify({
      profile: profile ? { major: profile.major, minor: profile.minor } : null,
      careerSummary: {
        cumulativeGpa: calculateCumulativeGpa([...past, ...planned]),
        cumulativeQualityPoints: qualityPoints,
        cumulativeGpaCredits: gradedCredits,
        totalCareerCredits: calculateTotalCredits(past) + calculateTotalCredits(planned) + plannedInProgressCredits,
        gradingScale: GRADE_OPTIONS.map(({ letter, points }) => ({ grade: letter, points })),
      },
      selectedScheduleSemester: selectedSemester ? { term: selectedSemester.term, year: selectedSemester.year } : null,
      currentSemester: currentSemester ? {
        term: currentSemester.term,
        year: currentSemester.year,
        courses: currentSemester.courses.map(({ code, title, credits, grade, gradePoints }) => ({ code, title, credits, grade, gradePoints })),
      } : null,
      plannedSemesters: planned.map(({ term, year, courses }) => ({ term, year, courses: courses.map(({ code, title, transcriptTitle, credits, grade, gradePoints, daysOfWeek, startTime, endTime, location }) => ({ code, title, transcriptTitle, credits, grade, gradePoints, daysOfWeek, startTime, endTime, location })) })),
      completedSemesters: past.map(({ term, year, courses }) => ({ term, year, courses: courses.map(({ code, title, credits, grade, gradePoints }) => ({ code, title, credits, grade, gradePoints })) })),
    });
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth" });
  }, [messages, loading]);

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const content = (suggested ?? input).trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError("");
    setLoading(true);
    const studentContext = getStudentContext();
    const history = messages.filter((item) =>
      item.role === "user" || replyContexts.current.get(item) === studentContext
    );
    try {
      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history, studentContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Advisor request failed.");
      const currentContext = getStudentContext();
      proposalContext.current = currentContext === studentContext && data.proposal ? studentContext : null;
      setProposal(proposalContext.current ? data.proposal : null);
      setMinorCandidates(data.minorCandidates ?? []);
      if (currentContext !== studentContext) {
        setInput(content);
        setError("Your Career data changed while the Advisor was responding. Send the message again to use the latest data.");
        return;
      }
      if (!data.answer?.trim()) return;
      const reply: Message = { role: "assistant", content: data.answer };
      replyContexts.current.set(reply, studentContext);
      setMessages((current) => [...current, reply]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advisor request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => () => {
    recordingRequestedRef.current = false;
    commitTranscriptRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  function toggleVoiceInput() {
    if (listening) {
      recordingRequestedRef.current = false;
      commitTranscriptRef.current = true;
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported by this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result?.isFinal && result[0]?.transcript) {
          voiceTranscriptRef.current = `${voiceTranscriptRef.current} ${result[0].transcript}`.trim();
        }
      }
    };
    recognition.onerror = () => {
      recordingRequestedRef.current = false;
      commitTranscriptRef.current = false;
      setListening(false);
      setError("Voice input stopped. Check microphone permissions and try again.");
    };
    recognition.onend = () => {
      if (recordingRequestedRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          recordingRequestedRef.current = false;
        }
      }
      setListening(false);
      const transcript = `${voiceBaseRef.current}${voiceBaseRef.current && voiceTranscriptRef.current ? " " : ""}${voiceTranscriptRef.current}`.trim();
      if (commitTranscriptRef.current && voiceTranscriptRef.current) setInput(transcript);
      commitTranscriptRef.current = false;
    };
    recognitionRef.current = recognition;
    voiceBaseRef.current = input.trim();
    voiceTranscriptRef.current = "";
    recordingRequestedRef.current = true;
    commitTranscriptRef.current = false;
    setError("");
    setListening(true);
    recognition.start();
  }

  function applyProposal() {
    const changes = proposal;
    if (!changes?.length) return;
    if (proposalContext.current !== getStudentContext()) {
      setProposal(null);
      setError("Your Career data changed. Ask the Advisor to refresh the proposal.");
      return;
    }
    if (changes.some((change) => (change.action === "add" || change.action === "update_meeting") && Boolean(change.startTime) !== Boolean(change.endTime))) {
      setError("Enter both a start and end time, or leave both blank.");
      return;
    }
    if (changes.some((change) => (change.action === "add" || change.action === "update_meeting") && change.startTime && change.endTime && change.endTime <= change.startTime)) {
      setError("Each end time must be later than its start time.");
      return;
    }
    const schedules = loadSchedules();
    const next = schedules.map((semester) => ({ ...semester, courses: [...semester.courses] }));
    const pastSchedules = loadPastSchedules().map((semester) => ({ ...semester, courses: [...semester.courses] }));
    const profile = loadProfile() ?? { fullName: "Student", major: null, minor: null };
    for (const change of changes) {
      if (change.action === "set_major") {
        if (change.value) profile.major = change.value;
        continue;
      }
      if (change.action === "set_minor") {
        if (change.value) profile.minor = change.value;
        continue;
      }
      let semester = next.find((item) => item.term === change.term && item.year === change.year);
      if (change.action === "update_meeting") {
        const course = semester?.courses.find((item) => item.code.replace(/\s+/g, "").toUpperCase() === change.code?.replace(/\s+/g, "").toUpperCase());
        if (course) {
          semester!.courses = semester!.courses.map((item) => item === course ? { ...item, daysOfWeek: change.daysOfWeek ?? item.daysOfWeek, startTime: change.startTime ?? item.startTime, endTime: change.endTime ?? item.endTime, location: change.location ?? item.location } : item);
        }
      } else if (change.action === "add") {
        if (!change.code || !change.title || change.credits === undefined || !change.term || change.year === undefined) continue;
        const code = change.code;
        if (!semester) {
          semester = { id: generateId(), term: change.term, year: change.year, courses: [] };
          next.push(semester);
        }
        if (!semester.courses.some((course) => course.code.replace(/\s+/g, "").toUpperCase() === code.replace(/\s+/g, "").toUpperCase())) {
          semester.courses.push({
            id: generateId(), code, title: change.title, credits: change.credits,
            daysOfWeek: change.daysOfWeek ?? [], startTime: change.startTime ?? "", endTime: change.endTime ?? "", location: change.location ?? "", color: getCourseColor(change.code),
            prerequisite_courses: [], grade: null, gradePoints: null,
          });
        }
      } else if (change.action === "remove" && semester && change.code) {
        const code = change.code;
        semester.courses = semester.courses.filter((course) => course.code.replace(/\s+/g, "").toUpperCase() !== code.replace(/\s+/g, "").toUpperCase());
      } else if (change.action === "set_grade" && change.grade && change.code && change.term && change.year !== undefined) {
        const gradePoints = GRADE_OPTIONS.find((option) => option.letter === change.grade)?.points ?? null;
        for (const collection of [next, pastSchedules]) {
          const targetSemester = collection.find((item) => item.term === change.term && item.year === change.year);
          const targetCourse = targetSemester?.courses.find((course) => course.code.replace(/\s+/g, "").toUpperCase() === change.code!.replace(/\s+/g, "").toUpperCase());
          if (targetCourse) {
            targetCourse.grade = change.grade;
            targetCourse.gradePoints = gradePoints;
          }
        }
      }
    }
    saveSchedules(next);
    onSchedulesApplied?.(next);
    savePastSchedules(pastSchedules);
    saveProfile(profile);
    setProposal(null);
    const reply: Message = { role: "assistant", content: "Done. I saved the requested changes." };
    replyContexts.current.set(reply, getStudentContext());
    setMessages((current) => [...current, reply]);
  }

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col px-4 pb-4" : "mx-auto flex h-screen w-full max-w-4xl flex-col px-5 py-6 md:px-10"}>
        {!compact && <header className="mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div>
            <div><h1 className="text-2xl font-semibold text-foreground">Student Advisor</h1><p className="text-sm text-muted-foreground">Ask about courses, prerequisites, or planning your semesters.</p></div>
          </div>
        </header>}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-7 overflow-y-auto px-1 py-5 md:px-3">
            {minorCandidates.length > 0 && (
              <div className="mx-auto w-full max-w-3xl rounded-2xl bg-accent/45 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Possible minor based on completed courses</p>
                <p className="mt-1 text-xs text-muted-foreground">This is a course-overlap estimate, not an official declaration.</p>
                <div className="mt-3 space-y-2">
                  {minorCandidates.map((candidate) => <div key={candidate.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-foreground"><strong>{candidate.name}</strong> · {candidate.evidenceCourses.join(", ")} <span className="text-muted-foreground">({candidate.confidence} match)</span></span>
                    <button type="button" onClick={() => void sendMessage(undefined, `Set my minor to ${candidate.name}`)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground">Set as my minor</button>
                  </div>)}
                </div>
              </div>
            )}
            {messages.length === 0 && (
                <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
                <Bot className="mb-5 h-8 w-8 text-primary" />
                <h2 className="text-2xl font-semibold text-foreground">What would you like to plan?</h2>
                <p className="mt-3 text-sm text-muted-foreground">Ask about courses, prerequisites, your major, or changes to your semesters.</p>
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                  {["What courses should I consider next?", "Check prerequisites for my planned courses", "Suggest electives related to my major"].map((suggestion) => (
                    <button key={suggestion} onClick={() => void sendMessage(undefined, suggestion)} className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">{suggestion}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`advisor-chat-enter group flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] text-sm leading-7 ${message.role === "user" ? "whitespace-pre-wrap rounded-[1.6rem] bg-accent px-5 py-3 text-foreground" : "text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_li]:ml-5 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc"}`}>
                  {message.role === "assistant" ? <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown> : message.content}
                </div>
              </div>
            ))}
            {proposal && proposal.length > 0 && (
              <div className="advisor-chat-enter w-full max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <h3 className="text-sm font-semibold text-foreground">Review your changes</h3>
                <div className="mt-3 space-y-4">
                  {proposal.map((change, index) => <div key={`${change.term}-${change.year}-${change.code}-${index}`} className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/35">
                    {change.title && <h4 className="mb-1 text-sm font-semibold text-foreground">{change.title}</h4>}
                    {!!change.conditionalOn?.length && (
                      <p className="mb-2 text-xs text-muted-foreground">Requires passing {change.conditionalOn.join(", ")} before this semester.</p>
                    )}
                    <p className="text-xs text-muted-foreground">{(change.action === "add" || change.action === "update_meeting") ? <>{change.action === "add" ? "Add" : "Update meeting for"} <span className="font-mono text-foreground">{change.code}</span> ({change.credits} cr) — {change.term} {change.year}</> : change.action === "remove" ? <>Remove <span className="font-mono text-foreground">{change.code}</span> — {change.term} {change.year}</> : change.action === "set_grade" ? <>Set grade for <span className="font-mono text-foreground">{change.code}</span> — {change.term} {change.year} to <strong className="text-foreground">{change.grade}</strong></> : <>Set {change.action === "set_major" ? "major" : "minor"} to <strong className="text-foreground">{change.value}</strong></>}</p>
                    {(change.action === "add" || change.action === "update_meeting") && <div className="mt-3 space-y-3">
                      <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Meeting days <span className="font-normal">(optional)</span></p><div className="flex flex-wrap gap-1.5">
                        {[{ day: 1, label: "Mon" }, { day: 2, label: "Tue" }, { day: 3, label: "Wed" }, { day: 4, label: "Thu" }, { day: 5, label: "Fri" }].map(({ day, label }) => <button type="button" key={day} onClick={() => setProposal((current) => (current ?? []).map((item, itemIndex) => itemIndex !== index ? item : { ...item, daysOfWeek: item.daysOfWeek?.includes(day) ? item.daysOfWeek.filter((value) => value !== day) : [...(item.daysOfWeek ?? []), day] }))} className={`rounded-md border px-2 py-1 text-xs ${(change.daysOfWeek ?? []).includes(day) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{label}</button>)}
                      </div></div>
                      <ScheduleTimeFields
                        start={change.startTime ?? ""}
                        end={change.endTime ?? ""}
                        days={change.daysOfWeek ?? []}
                        optional
                        onChange={(startTime, endTime) => setProposal((current) =>
                          current?.map((item, itemIndex) => itemIndex === index ? { ...item, startTime, endTime } : item) ?? null
                        )}
                      />
                      <label className="block text-xs text-muted-foreground">Location <span className="font-normal">(optional)</span><input value={change.location ?? ""} onChange={(event) => setProposal((current) => (current ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, location: event.target.value } : item))} placeholder="Room or building" className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground" /></label>
                    </div>}
                  </div>)}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={applyProposal}><Check className="mr-1.5 h-4 w-4" />Apply changes</Button>
                  <Button size="sm" variant="outline" onClick={() => setProposal(null)}><X className="mr-1.5 h-4 w-4" />Discard</Button>
                </div>
              </div>
            )}
            {loading && <div className="advisor-chat-enter flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" />Thinking…</div>}
            <div ref={bottomRef} />
          </div>
          {error && <p role="alert" className="px-5 pb-2 text-sm text-destructive">{error}</p>}
          <form onSubmit={(event) => void sendMessage(event)} className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-[1.8rem] border border-border bg-card px-4 py-3 shadow-lg shadow-black/5 transition focus-within:border-primary/50">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !listening) { event.preventDefault(); void sendMessage(); } }} placeholder={listening ? "Listening… select Done when you finish" : "Ask about your courses or semester plan"} rows={1} maxLength={4000} className="max-h-36 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
            <button type="button" onClick={toggleVoiceInput} aria-label={listening ? "Done recording" : "Start voice input"} title={listening ? "Done" : "Speak your message"} className={`mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${listening ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}</button>
            <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || loading || listening} className="mb-0.5 h-10 w-10 rounded-full motion-safe:transition-transform motion-safe:enabled:hover:-translate-y-0.5 motion-safe:enabled:active:scale-95"><ArrowUp className="h-4 w-4" /></Button>
          </form>
        </section>
        <p className="mx-auto mt-3 max-w-3xl text-center text-xs text-muted-foreground">AI suggestions can be incorrect. Confirm degree requirements and registration decisions with your academic advisor.</p>
    </div>
  );
}
