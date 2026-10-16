import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FIELD_LABELS, focusField } from "@/lib/listing-form";

export function MissingFieldsAlert({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  const count = fields.length === 1 ? "1 thing" : `${fields.length} things`;
  return (
    <Alert className="border-info/40 bg-info/5 rounded-xl [&>svg]:text-info">
      <Info aria-hidden />
      <AlertTitle>We couldn&apos;t infer {count} from the video:</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {fields.map((f) => (
            <li key={f}>
              <button
                type="button"
                onClick={() => focusField(f)}
                className="text-foreground underline underline-offset-4 hover:no-underline"
              >
                {FIELD_LABELS[f] ?? f}
              </button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
