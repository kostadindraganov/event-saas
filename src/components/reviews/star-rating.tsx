"use client";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Read-only 5-star display — review карти. Закръгля визуално до цяло число;
// точната стойност остава в aria-label за screen readers.
export function StarRating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn("size-4", i < Math.round(value) ? "fill-accent-gold text-accent-gold" : "text-muted-foreground")}
        />
      ))}
    </span>
  );
}

// Интерактивен избор — h-11/w-11 touch target на бутон, aria-label на всяка звезда.
export function StarRatingInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            aria-label={`${label} ${star}/5`}
            aria-pressed={star === value}
            onClick={() => onChange(star)}
            className="flex size-11 items-center justify-center"
          >
            <Star className={cn("size-6", star <= value ? "fill-accent-gold text-accent-gold" : "text-muted-foreground")} />
          </button>
        );
      })}
    </div>
  );
}
