"use client";

import { StyledSelect } from "@/components/ui/styled-select";

const options = {
  major: [
    "Business Administration",
    "Communication Studies",
    "Computer Science",
    "Engineering and Management Science",
    "General Engineering",
    "International Studies",
    "Renewable Energy Systems Engineering",
  ],
  minor: [
    "African Studies",
    "Business Administration",
    "Communication Studies",
    "Computer Science",
    "English",
    "Environmental Studies",
    "Gender Studies",
    "Human Resource Development",
    "International Studies",
    "Leadership",
    "Mathematics",
    "Organizational Studies",
    "Psychology",
  ],
};

type ProgramSelectProps = {
  id: string;
  kind: keyof typeof options;
  value: string;
  required?: boolean;
  onValueChange: (value: string) => void;
};

export function ProgramSelect({ id, kind, value, required, onValueChange }: ProgramSelectProps) {
  const choices = options[kind];
  const placeholder = kind === "major" ? "Select a major" : "No minor";
  const rows = [
    ...(!required ? [{ value: "", label: placeholder }] : []),
    ...(value && !choices.includes(value) ? [{ value, label: `${value} (saved)` }] : []),
    ...choices.map((choice) => ({ value: choice, label: choice })),
  ];

  return <StyledSelect id={id} label={kind === "major" ? "Major" : "Minor"} value={value} options={rows}
    placeholder={placeholder} required={required} onValueChange={onValueChange} triggerClassName="min-h-11" />;
}
