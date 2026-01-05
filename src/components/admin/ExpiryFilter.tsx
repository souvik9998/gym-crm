import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExpiryFilterValue = "all" | "today" | "tomorrow" | "7days" | "10days";

interface ExpiryFilterProps {
  value: ExpiryFilterValue;
  onChange: (value: ExpiryFilterValue) => void;
}

const filters: { value: ExpiryFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "7days", label: "7 Days" },
  { value: "10days", label: "10 Days" },
];

export const ExpiryFilter = ({ value, onChange }: ExpiryFilterProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <Button
          key={filter.value}
          variant={value === filter.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(filter.value)}
          className={cn(
            "text-xs",
            value === filter.value && "bg-primary text-primary-foreground"
          )}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
};
