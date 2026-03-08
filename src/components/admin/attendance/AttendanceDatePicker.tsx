import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AttendanceDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const AttendanceDatePicker = ({ value, onChange, label, className }: AttendanceDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : undefined;

  const handleSelect = (d: Date | undefined) => {
    if (d) {
      onChange(format(d, "yyyy-MM-dd"));
      setOpen(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <span className="text-[10px] lg:text-xs text-muted-foreground font-medium">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-8 lg:h-9 w-full justify-start text-left font-normal text-xs lg:text-sm px-2.5 lg:px-3 rounded-lg",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5 lg:h-4 lg:w-4 text-muted-foreground shrink-0" />
            {date ? format(date, "dd MMM yyyy") : "Pick date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 rounded-xl shadow-lg border border-border/60" align="start" sideOffset={4}>
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-3",
              caption: "flex justify-center pt-1 relative items-center text-sm font-medium",
              caption_label: "text-sm font-semibold",
              nav: "space-x-1 flex items-center",
              nav_button: cn(
                "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              ),
              table: "w-full border-collapse",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-8 lg:w-9 font-medium text-[11px] lg:text-xs",
              row: "flex w-full mt-1",
              cell: cn(
                "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
              ),
              day: cn(
                "h-8 w-8 lg:h-9 lg:w-9 p-0 font-normal text-xs lg:text-sm rounded-lg transition-all duration-150",
                "hover:bg-primary/10 hover:text-primary",
                "focus:bg-primary/10 focus:text-primary focus:outline-none"
              ),
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm",
              day_today: "bg-accent text-accent-foreground font-semibold",
              day_outside: "text-muted-foreground/40",
              day_disabled: "text-muted-foreground/30",
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
