import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, isToday, parseISO, isBefore, startOfDay } from "date-fns";
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

// Indian National Holidays for current year (and next year)
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [formType, setFormType] = useState<string>("full_day");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("13:00");
  const [formOpenTime, setFormOpenTime] = useState("06:00");
  const [formCloseTime, setFormCloseTime] = useState("22:00");
  const [formNotify, setFormNotify] = useState(false);
  const [formWhatsAppMessage, setFormWhatsAppMessage] = useState("");

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

  // Fetch holidays
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

  // Calendar days
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

  // Generate WhatsApp message based on form state
  const generateWhatsAppMessage = useCallback((name: string, date: Date | null, type: string, desc: string, openTime: string, closeTime: string, startTime: string, endTime: string) => {
    if (!date || !name.trim()) return "";
    const dateStr = format(date, "EEEE, dd MMMM yyyy");
    const gymName = currentBranch?.name || "our gym";
    
    let msg = `🏋️ *Gym Holiday Notice*\n\n`;
    msg += `Dear Member,\n\n`;
    msg += `We would like to inform you that *${gymName}* will be `;
    
    if (type === "full_day") {
      msg += `*closed* on *${dateStr}*`;
      msg += ` for *${name}*.`;
    } else if (type === "half_day") {
      msg += `open for *half day* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Timings:* ${startTime} – ${endTime}`;
    } else if (type === "late_opening") {
      msg += `opening *late* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Opens at:* ${openTime}`;
    } else if (type === "early_closing") {
      msg += `closing *early* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Closes at:* ${closeTime}`;
    }
    
    if (desc.trim()) {
      msg += `\n\n📝 ${desc.trim()}`;
    }
    
    msg += `\n\nRegular hours will resume the next working day.`;
    msg += `\n\nThank you for your understanding! 💪`;
    
    return msg;
  }, [currentBranch]);

  // Auto-update message when form changes
  useEffect(() => {
    if (formNotify) {
      const msg = generateWhatsAppMessage(formName, selectedDate, formType, formDescription, formOpenTime, formCloseTime, formStartTime, formEndTime);
      setFormWhatsAppMessage(msg);
    }
  }, [formName, selectedDate, formType, formDescription, formOpenTime, formCloseTime, formStartTime, formEndTime, formNotify, generateWhatsAppMessage]);

  const openAddDialog = (date: Date, prefillName?: string) => {
    setEditingHoliday(null);
    setSelectedDate(date);
    setFormName(prefillName || "");
    setFormDescription("");
    setFormType("full_day");
    setFormStartTime("09:00");
    setFormEndTime("13:00");
    setFormOpenTime("06:00");
    setFormCloseTime("22:00");
    setFormNotify(false);
    setFormWhatsAppMessage("");
    setIsDialogOpen(true);
  };

  const openEditDialog = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setSelectedDate(parseISO(holiday.holiday_date));
    setFormName(holiday.holiday_name);
    setFormDescription(holiday.description || "");
    setFormType(holiday.holiday_type);
    setFormStartTime(holiday.half_day_start_time || "09:00");
    setFormEndTime(holiday.half_day_end_time || "13:00");
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
    const payload = {
      branch_id: currentBranch.id,
      holiday_name: formName.trim(),
      holiday_date: dateStr,
      description: formDescription.trim() || null,
      holiday_type: formType,
      half_day_start_time: formType === "half_day" ? formStartTime : null,
      half_day_end_time: formType === "half_day" ? formEndTime : null,
      notify_members: formNotify,
    };

    try {
      if (editingHoliday) {
        const { error } = await supabase
          .from("gym_holidays")
          .update(payload)
          .eq("id", editingHoliday.id);

        if (error) {
          if (error.code === "23505") {
            toast.error("A holiday already exists on this date");
          } else {
            toast.error("Failed to update holiday", { description: error.message });
          }
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
          if (error.code === "23505") {
            toast.error("A holiday already exists on this date");
          } else {
            toast.error("Failed to add holiday", { description: error.message });
          }
          return;
        }

        await logAdminActivity({
          category: "settings",
          type: "holiday_added",
          description: `Added holiday "${formName}" on ${format(selectedDate, "dd MMM yyyy")}`,
          entityType: "gym_holidays",
          entityName: formName,
          newValue: { name: formName, date: dateStr, type: formType },
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
          description: `Deleted holiday "${holiday.holiday_name}" on ${format(parseISO(holiday.holiday_date), "dd MMM yyyy")}`,
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
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div>
                <CardTitle className="text-base lg:text-xl">Holiday Calendar</CardTitle>
                <CardDescription className="text-xs lg:text-sm">Click any date to add or manage holidays</CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 rounded-xl text-xs lg:text-sm"
              onClick={() => openAddDialog(new Date())}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Holiday
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 lg:p-6 pt-2 lg:pt-2">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeftIcon className="w-4 h-4" />
            </Button>
            <h3 className="font-semibold text-sm lg:text-base">{format(currentMonth, "MMMM yyyy")}</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-[10px] lg:text-xs font-medium text-muted-foreground py-1.5">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for padding */}
            {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}

            {calendarDays.days.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const gymHoliday = holidayDateSet.get(dateStr);
              const nationalHoliday = nationalHolidayMap.get(dateStr);
              const isCurrentDay = isToday(day);
              const isPast = isBefore(day, startOfDay(new Date())) && !isCurrentDay;
              const isSunday = getDay(day) === 0;

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 text-xs lg:text-sm group",
                    "hover:bg-accent/50 hover:scale-105 active:scale-95",
                    isPast && "opacity-50",
                    isCurrentDay && "ring-2 ring-primary/30 bg-primary/5 font-bold",
                    gymHoliday && "bg-red-500/10 text-red-600 dark:text-red-400 font-semibold ring-1 ring-red-500/20",
                    !gymHoliday && nationalHoliday && "bg-orange-500/8 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/15",
                    isSunday && !gymHoliday && !nationalHoliday && "text-red-400",
                  )}
                >
                  <span>{format(day, "d")}</span>
                  {gymHoliday && (
                    <div className="absolute bottom-0.5 lg:bottom-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                  {!gymHoliday && nationalHoliday && (
                    <div className="absolute bottom-0.5 lg:bottom-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                  )}
                  {/* Tooltip on hover */}
                  {(gymHoliday || nationalHoliday) && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[9px] lg:text-[10px] px-2 py-0.5 rounded-md shadow-md border border-border/50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                      {gymHoliday?.holiday_name || nationalHoliday}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Gym Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">National Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full ring-2 ring-primary/30 bg-primary/20" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Today</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Holidays */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <SparklesIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div>
              <CardTitle className="text-base lg:text-xl">Upcoming Holidays</CardTitle>
              <CardDescription className="text-xs lg:text-sm">Next scheduled gym closures</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcomingHolidays.length === 0 ? (
            <div className="text-center py-8">
              <SunIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No upcoming holidays</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Click a date on the calendar to add one</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingHolidays.map(holiday => {
                const date = parseISO(holiday.holiday_date);
                const isUpcoming = isToday(date);
                return (
                  <div
                    key={holiday.id}
                    className={cn(
                      "flex items-center justify-between p-3 lg:p-4 rounded-xl border border-border/30 transition-all duration-200 hover:shadow-sm hover:border-border/50",
                      isUpcoming && "bg-red-500/5 border-red-500/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex flex-col items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-xl text-center",
                        isUpcoming ? "bg-red-500/10 text-red-600" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <span className="text-[10px] lg:text-xs font-medium leading-none">{format(date, "MMM")}</span>
                        <span className="text-sm lg:text-base font-bold leading-tight">{format(date, "d")}</span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{holiday.holiday_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] lg:text-xs px-1.5 py-0.5 rounded-md",
                            holiday.holiday_type === "full_day"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-amber-500/10 text-amber-600"
                          )}>
                            {holiday.holiday_type === "full_day" ? (
                              <>Full Day</>
                            ) : (
                              <>
                                <ClockIcon className="w-3 h-3" />
                                {holiday.half_day_start_time?.slice(0, 5)} – {holiday.half_day_end_time?.slice(0, 5)}
                              </>
                            )}
                          </span>
                          {holiday.notify_members && (
                            <span className="inline-flex items-center gap-1 text-[10px] lg:text-xs px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                              <BellAlertIcon className="w-3 h-3" />
                              Notified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(holiday)}
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(holiday)}
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
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
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div>
              <CardTitle className="text-base lg:text-xl">National Holidays {currentYear}</CardTitle>
              <CardDescription className="text-xs lg:text-sm">Quick-add Indian national holidays to your calendar</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
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
                      "flex items-center gap-3 p-3 rounded-xl border border-border/30 text-left transition-all duration-200",
                      alreadyAdded
                        ? "opacity-50 cursor-not-allowed bg-muted/20"
                        : "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-orange-500/10 text-orange-600 text-center flex-shrink-0">
                      <span className="text-[9px] font-medium leading-none">{format(parseISO(holiday.date), "MMM")}</span>
                      <span className="text-sm font-bold leading-tight">{format(parseISO(holiday.date), "d")}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{holiday.name}</p>
                      <p className="text-[10px] lg:text-xs text-muted-foreground">{format(parseISO(holiday.date), "EEEE")}</p>
                    </div>
                    {alreadyAdded ? (
                      <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">Added</span>
                    ) : (
                      <PlusIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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

            <div className="space-y-1.5">
              <Label className="text-xs lg:text-sm font-medium">Holiday Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">🏖️ Full Day Closed</SelectItem>
                  <SelectItem value="half_day">⏰ Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formType === "half_day" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs lg:text-sm font-medium">Open From</Label>
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={e => setFormStartTime(e.target.value)}
                    className="h-10 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs lg:text-sm font-medium">Close At</Label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={e => setFormEndTime(e.target.value)}
                    className="h-10 rounded-lg"
                  />
                </div>
              </div>
            )}

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
