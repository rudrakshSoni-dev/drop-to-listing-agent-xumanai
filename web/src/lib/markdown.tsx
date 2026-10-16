import type { ReactNode } from "react";

/** Tiny renderer for listing descriptions: paragraphs, "- " bullets and **bold**. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*] /, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}
