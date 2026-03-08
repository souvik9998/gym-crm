import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, parseISO, isBefore, startOfDay } from "date-fns";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SunIcon,
  BellAlertIcon,
  ClockIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";

interface Holiday {
  id: string;
  branch_id: string;
  holiday_name: string;
  holiday_date: string;
  description: string | null;
  holiday_type: string;
  half_day_start_time: string | null;
  half_day_end_time: string | null;
  notify_members: boolean;
  created_at: string;
  created_by: string | null;
}

// Indian National Holidays
const getNationalHolidays = (year: number) => [
  { date: `${year}-01-26`, name: "Republic Day" },
  { date: `${year}-03-14`, name: "Holi" },
  { date: `${year}-03-31`, name: "Eid ul-Fitr" },
  { date: `${year}-04-06`, name: "Ram Navami" },
  { date: `${year}-04-10`, name: "Mahavir Jayanti" },
  { date: `${year}-04-14`, name: "Ambedkar Jayanti" },
  { date: `${year}-04-18`, name: "Good Friday" },
  { date: `${year}-05-01`, name: "May Day" },
  { date: `${year}-05-12`, name: "Buddha Purnima" },
  { date: `${year}-06-07`, name: "Eid ul-Adha" },
  { date: `${year}-07-06`, name: "Muharram" },
  { date: `${year}-08-15`, name: "Independence Day" },
  { date: `${year}-08-16`, name: "Janmashtami" },
  { date: `${year}-09-05`, name: "Milad-un-Nabi" },
  { date: `${year}-10-02`, name: "Gandhi Jayanti" },
  { date: `${year}-10-02`, name: "Dussehra" },
  { date: `${year}-10-20`, name: "Diwali" },
  { date: `${year}-10-21`, name: "Diwali (Day 2)" },
  { date: `${year}-11-05`, name: "Guru Nanak Jayanti" },
  { date: `${year}-11-15`, name: "Chhath Puja" },
  { date: `${year}-12-25`, name: "Christmas" },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const HolidayCalendarTab = () => {
  const { currentBranch } = useBranch();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOpenTime, setFormOpenTime] = useState("");
  const [formCloseTime, setFormCloseTime] = useState("");
  const [formNotify, setFormNotify] = useState(false);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({ open: false, title: "", description: "", onConfirm: () => {}, variant: "default" });

  const currentYear = currentMonth.getFullYear();
  const nationalHolidays = useMemo(() => {
    return [...getNationalHolidays(currentYear), ...getNationalHolidays(currentYear + 1)];
  }, [currentYear]);

  const nationalHolidayMap = useMemo(() => {
    const map = new Map<string, string>();
    nationalHolidays.forEach(h => map.set(h.date, h.name));
    return map;
  }, [nationalHolidays]);

  const fetchHolidays = useCallback(async () => {
    if (!currentBranch) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("gym_holidays")
      .select("*")
      .eq("branch_id", currentBranch.id)
      .order("holiday_date", { ascending: true });

    if (!error && data) {
      setHolidays(data as unknown as Holiday[]);
    }
    setIsLoading(false);
  }, [currentBranch]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  const holidayDateSet = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach(h => map.set(h.holiday_date, h));
    return map;
  }, [holidays]);

  const upcomingHolidays = useMemo(() => {
    const today = startOfDay(new Date());
    return holidays.filter(h => !isBefore(parseISO(h.holiday_date), today)).slice(0, 10);
  }, [holidays]);

  const openAddDialog = (date: Date, prefillName?: string) => {
    setEditingHoliday(null);
    setSelectedDate(date);
    setFormName(prefillName || "");
    setFormDescription("");
    setFormOpenTime("");
    setFormCloseTime("");
    setFormNotify(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setSelectedDate(parseISO(holiday.holiday_date));
    setFormName(holiday.holiday_name);
    setFormDescription(holiday.description || "");
    setFormOpenTime(holiday.half_day_start_time || "");
    setFormCloseTime(holiday.half_day_end_time || "");
    setFormNotify(holiday.notify_members);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentBranch || !selectedDate || !formName.trim()) {
      toast.error("Please fill in the holiday name");
      return;
    }
    setIsSaving(true);

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const isFullDay = !formOpenTime && !formCloseTime;
    const payload = {
      branch_id: currentBranch.id,
      holiday_name: formName.trim(),
      holiday_date: dateStr,
      description: formDescription.trim() || null,
      holiday_type: isFullDay ? "full_day" : "half_day",
      half_day_start_time: formOpenTime || null,
      half_day_end_time: formCloseTime || null,
      notify_members: formNotify,
    };

    try {
      if (editingHoliday) {
        const { error } = await supabase
          .from("gym_holidays")
          .update(payload)
          .eq("id", editingHoliday.id);

        if (error) {
          if (error.code === "23505") toast.error("A holiday already exists on this date");
          else toast.error("Failed to update holiday", { description: error.message });
          return;
        }

        await logAdminActivity({
          category: "settings",
          type: "holiday_updated",
          description: `Updated holiday "${formName}" on ${format(selectedDate, "dd MMM yyyy")}`,
          entityType: "gym_holidays",
          entityId: editingHoliday.id,
          entityName: formName,
          oldValue: { name: editingHoliday.holiday_name, date: editingHoliday.holiday_date },
          newValue: { name: formName, date: dateStr },
          branchId: currentBranch.id,
        });
        toast.success("Holiday updated");
      } else {
        const { error } = await supabase
          .from("gym_holidays")
          .insert(payload);

        if (error) {
          if (error.code === "23505") toast.error("A holiday already exists on this date");
          else toast.error("Failed to add holiday", { description: error.message });
          return;
        }

        await logAdminActivity({
          category: "settings",
          type: "holiday_added",
          description: `Added holiday "${formName}" on ${format(selectedDate, "dd MMM yyyy")}`,
          entityType: "gym_holidays",
          entityName: formName,
          newValue: { name: formName, date: dateStr },
          branchId: currentBranch.id,
        });
        toast.success("Holiday added");
      }

      setIsDialogOpen(false);
      fetchHolidays();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (holiday: Holiday) => {
    setConfirmDialog({
      open: true,
      title: "Delete Holiday",
      description: `Are you sure you want to delete "${holiday.holiday_name}" on ${format(parseISO(holiday.holiday_date), "dd MMM yyyy")}?`,
      variant: "destructive",
      onConfirm: async () => {
        const { error } = await supabase
          .from("gym_holidays")
          .delete()
          .eq("id", holiday.id);

        if (error) {
          toast.error("Failed to delete", { description: error.message });
          return;
        }

        await logAdminActivity({
          category: "settings",
          type: "holiday_deleted",
          description: `Deleted holiday "${holiday.holiday_name}"`,
          entityType: "gym_holidays",
          entityId: holiday.id,
          entityName: holiday.holiday_name,
          branchId: currentBranch?.id,
        });

        setHolidays(prev => prev.filter(h => h.id !== holiday.id));
        toast.success("Holiday deleted");
      },
    });
  };

  const handleDayClick = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const existingHoliday = holidayDateSet.get(dateStr);

    if (existingHoliday) {
      openEditDialog(existingHoliday);
    } else {
      const nationalName = nationalHolidayMap.get(dateStr);
      openAddDialog(day, nationalName || "");
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Calendar Card */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-5 pb-1 lg:pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-primary/10 text-primary">
                <CalendarDaysIcon className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm lg:text-base">Holiday Calendar</CardTitle>
                <CardDescription className="text-[10px] lg:text-xs">Click a date to add or manage holidays</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl text-[10px] lg:text-xs h-7 lg:h-8 px-2.5 lg:px-3"
              onClick={() => openAddDialog(new Date())}
            >
              <PlusIcon className="w-3 h-3" />
              Add
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3 lg:p-5 pt-1 lg:pt-1">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeftIcon className="w-3.5 h-3.5" />
            </Button>
            <h3 className="font-semibold text-xs lg:text-sm">{format(currentMonth, "MMMM yyyy")}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-0.5 mb-0.5">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-[9px] lg:text-[10px] font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid - Compact with holiday names */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[40px] lg:min-h-[52px]" />
            ))}

            {calendarDays.days.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const gymHoliday = holidayDateSet.get(dateStr);
              const nationalHoliday = nationalHolidayMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isPast = isBefore(day, startOfDay(new Date())) && !isCurrentDay;
              const isSunday = getDay(day) === 0;
              const label = gymHoliday?.holiday_name || nationalHoliday;

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "min-h-[40px] lg:min-h-[52px] rounded-lg flex flex-col items-center justify-start pt-1 relative transition-all duration-150 group overflow-hidden",
                    "hover:bg-accent/50 active:scale-[0.97]",
                    isPast && "opacity-40",
                    isCurrentDay && "ring-1.5 ring-primary/40 bg-primary/5 font-bold",
                    gymHoliday && "bg-destructive/8 ring-1 ring-destructive/20",
                    !gymHoliday && nationalHoliday && "bg-accent/60 ring-1 ring-border/40",
                    isSunday && !gymHoliday && !nationalHoliday && "text-destructive/70",
                  )}
                >
                  <span className={cn(
                    "text-[11px] lg:text-xs leading-none",
                    gymHoliday && "text-destructive font-semibold",
                    !gymHoliday && nationalHoliday && "font-medium",
                  )}>
                    {format(day, "d")}
                  </span>
                  {label && (
                    <span className={cn(
                      "text-[6px] lg:text-[7px] leading-tight mt-0.5 px-0.5 text-center line-clamp-2 w-full",
                      gymHoliday ? "text-destructive/80 font-medium" : "text-muted-foreground",
                    )}>
                      {label}
                    </span>
                  )}
                  {gymHoliday && (
                    <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-destructive" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <span className="text-[9px] lg:text-[10px] text-muted-foreground">Gym Holiday</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
              <span className="text-[9px] lg:text-[10px] text-muted-foreground">National</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full ring-1.5 ring-primary/40 bg-primary/20" />
              <span className="text-[9px] lg:text-[10px] text-muted-foreground">Today</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Holidays */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-5 pb-1 lg:pb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-accent text-foreground/70">
              <SparklesIcon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm lg:text-base">Upcoming Holidays</CardTitle>
              <CardDescription className="text-[10px] lg:text-xs">Next scheduled gym closures</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-5 pt-0 lg:pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-14 bg-muted/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcomingHolidays.length === 0 ? (
            <div className="text-center py-6">
              <SunIcon className="w-8 h-8 mx-auto text-muted-foreground/30 mb-1.5" />
              <p className="text-xs text-muted-foreground">No upcoming holidays</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Click a date on the calendar to add one</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {upcomingHolidays.map(holiday => {
                const date = parseISO(holiday.holiday_date);
                const isTodayHoliday = isToday(date);
                const hasTimings = holiday.half_day_start_time || holiday.half_day_end_time;
                return (
                  <div
                    key={holiday.id}
                    className={cn(
                      "flex items-center justify-between p-2.5 lg:p-3 rounded-xl border border-border/30 transition-all duration-200 hover:shadow-sm hover:border-border/50",
                      isTodayHoliday && "bg-destructive/5 border-destructive/20"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "flex flex-col items-center justify-center w-10 h-10 rounded-lg text-center",
                        isTodayHoliday ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <span className="text-[9px] font-medium leading-none">{format(date, "MMM")}</span>
                        <span className="text-sm font-bold leading-tight">{format(date, "d")}</span>
                      </div>
                      <div>
                        <p className="font-medium text-xs lg:text-sm">{holiday.holiday_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasTimings ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] lg:text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-foreground/70">
                              <ClockIcon className="w-2.5 h-2.5" />
                              {holiday.half_day_start_time?.slice(0, 5)} – {holiday.half_day_end_time?.slice(0, 5)}
                            </span>
                          ) : (
                            <span className="text-[9px] lg:text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive">
                              Closed All Day
                            </span>
                          )}
                          {holiday.notify_members && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] lg:text-[10px] px-1.5 py-0.5 rounded-md bg-accent text-foreground/70">
                              <BellAlertIcon className="w-2.5 h-2.5" />
                              Notified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground" onClick={() => openEditDialog(holiday)}>
                        <PencilIcon className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => handleDelete(holiday)}>
                        <TrashIcon className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* National Holidays Quick-Add */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-5 pb-1 lg:pb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-accent text-foreground/70">
              <CalendarDaysIcon className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-sm lg:text-base">National Holidays {currentYear}</CardTitle>
              <CardDescription className="text-[10px] lg:text-xs">Quick-add Indian national holidays</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-5 pt-0 lg:pt-0">
          <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2">
            {getNationalHolidays(currentYear)
              .filter(h => !isBefore(parseISO(h.date), startOfDay(new Date())))
              .map(holiday => {
                const alreadyAdded = holidayDateSet.has(holiday.date);
                return (
                  <button
                    key={holiday.date}
                    disabled={alreadyAdded}
                    onClick={() => openAddDialog(parseISO(holiday.date), holiday.name)}
                    className={cn(
                      "flex items-center gap-2.5 p-2.5 rounded-xl border border-border/30 text-left transition-all duration-200",
                      alreadyAdded
                        ? "opacity-40 cursor-not-allowed bg-muted/20"
                        : "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-accent text-foreground/70 text-center flex-shrink-0">
                      <span className="text-[8px] font-medium leading-none">{format(parseISO(holiday.date), "MMM")}</span>
                      <span className="text-xs font-bold leading-tight">{format(parseISO(holiday.date), "d")}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{holiday.name}</p>
                      <p className="text-[9px] text-muted-foreground">{format(parseISO(holiday.date), "EEEE")}</p>
                    </div>
                    {alreadyAdded ? (
                      <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">Added</span>
                    ) : (
                      <PlusIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Holiday Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingHoliday ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
            <DialogDescription>
              {selectedDate ? format(selectedDate, "EEEE, dd MMMM yyyy") : "Select holiday details"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-name" className="text-xs lg:text-sm font-medium">Holiday Name *</Label>
              <Input
                id="holiday-name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Independence Day"
                className="h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-date" className="text-xs lg:text-sm font-medium">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                onChange={e => setSelectedDate(e.target.value ? parseISO(e.target.value) : null)}
                className="h-10 rounded-lg"
              />
            </div>

            {/* Timings - Open/Close */}
            <div className="space-y-1.5">
              <Label className="text-xs lg:text-sm font-medium">Gym Timings (leave empty for full day closure)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Opens at</span>
                  <Input
                    type="time"
                    value={formOpenTime}
                    onChange={e => setFormOpenTime(e.target.value)}
                    placeholder="--:--"
                    className="h-10 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Closes at</span>
                  <Input
                    type="time"
                    value={formCloseTime}
                    onChange={e => setFormCloseTime(e.target.value)}
                    placeholder="--:--"
                    className="h-10 rounded-lg"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {!formOpenTime && !formCloseTime
                  ? "⛔ Gym will be marked as closed all day"
                  : `🕐 Gym open from ${formOpenTime || "--:--"} to ${formCloseTime || "--:--"}`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="holiday-desc" className="text-xs lg:text-sm font-medium">Description (optional)</Label>
              <Textarea
                id="holiday-desc"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Any additional details..."
                className="min-h-[60px] rounded-lg resize-none"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/20 border border-border/40 rounded-xl">
              <div className="space-y-0.5">
                <p className="font-medium text-sm">Notify Members via WhatsApp</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground">Send holiday notice to all active members</p>
              </div>
              <Switch checked={formNotify} onCheckedChange={setFormNotify} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formName.trim()} className="gap-2 rounded-xl">
              {isSaving ? (
                <>
                  <ButtonSpinner />
                  Saving...
                </>
              ) : editingHoliday ? (
                "Update Holiday"
              ) : (
                "Add Holiday"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={open => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />
    </div>
  );
};

export default HolidayCalendarTab;
