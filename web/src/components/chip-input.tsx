"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function ChipInput({
  id,
  value,
  onChange,
  placeholder,
  max = 12,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const chip = draft.trim().replace(/,$/, "");
    if (chip && !value.includes(chip) && value.length < max) onChange([...value, chip]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((chip) => (
            <li key={chip}>
              <Badge variant="secondary" className="gap-1 rounded-full pr-1">
                {chip}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((c) => c !== chip))}
                  className="hover:bg-background/60 rounded-full p-0.5"
                  aria-label={`Remove ${chip}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={value.length >= max ? `Up to ${max}` : placeholder}
        disabled={value.length >= max}
      />
    </div>
  );
}
