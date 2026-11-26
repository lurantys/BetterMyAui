import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function GpaEye({ revealed }: { revealed: boolean }) {
  return <span aria-hidden="true" className="relative inline-grid size-4 shrink-0 place-items-center">
    <Eye className={cn("absolute size-4 transition-[transform,opacity] duration-200 motion-reduce:transition-none", revealed ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
    <EyeOff className={cn("absolute size-4 transition-[transform,opacity] duration-200 motion-reduce:transition-none", revealed ? "scale-75 opacity-0" : "scale-100 opacity-100")} />
  </span>;
}

export function GpaToggle({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  const label = revealed ? "Hide GPA" : "Show GPA";
  return <Button type="button" size="icon" variant="ghost" aria-label={label} title={label} aria-expanded={revealed}
    onClick={onToggle} className="size-8 text-muted-foreground hover:text-foreground">
    <GpaEye revealed={revealed} />
  </Button>;
}

export function ConcealedGpa({ revealed, value, className }: { revealed: boolean; value: string; className?: string }) {
  return <span className={cn("inline-block tabular-nums", className)}>
    {revealed ? <span className="gpa-reveal inline-block">{value}</span> : (
      <><span aria-hidden="true" className="gpa-conceal inline-block select-none tracking-widest text-muted-foreground blur-[1.5px]">••••</span>
        <span className="sr-only">GPA hidden</span></>
    )}
  </span>;
}
