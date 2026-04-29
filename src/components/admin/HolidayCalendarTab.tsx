import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ChatBubbleLeftEllipsisIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { TimePicker12h } from "@/components/ui/time-picker-12h";
import { useWhatsAppOverlay } from "@/hooks/useWhatsAppOverlay";
import { WhatsAppSendingOverlay } from "@/components/ui/whatsapp-sending-overlay";
import { useTenantPrimaryDomain } from "@/hooks/useTenantPrimaryDomain";
import { buildPublicUrl } from "@/lib/publicUrl";
import { ShareIcon, TicketIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import ShareCalendarDialog from "./ShareCalendarDialog";

interface CalendarEvent {
  id: string;
  title: string;
  slug: string;
  event_date: string;
  event_end_date: string | null;
  location: string | null;
  status: string;
}

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
  { date: `${year}-10-02`, name: "Gandhi Jayanti / Dussehra" },
  { date: `${year}-10-20`, name: "Diwali" },
  { date: `${year}-10-21`, name: "Diwali (Day 2)" },
  { date: `${year}-11-05`, name: "Guru Nanak Jayanti" },
  { date: `${year}-11-15`, name: "Chhath Puja" },
  { date: `${year}-12-25`, name: "Christmas" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Convert 24h time string "HH:mm" to 12h format "h:mm AM/PM"
const formatTime12h = (time: string | null | undefined): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

const HolidayCalendarTab = () => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const { data: customDomain } = useTenantPrimaryDomain(currentBranch?.id);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const whatsAppOverlay = useWhatsAppOverlay();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

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

  // Fetch holidays + events for current branch
  const fetchHolidays = useCallback(async () => {
    if (!currentBranch) return;
    setIsLoading(true);
    const [holidaysRes, eventsRes] = await Promise.all([
      supabase
        .from("gym_holidays")
        .select("*")
        .eq("branch_id", currentBranch.id)
        .order("holiday_date", { ascending: true }),
      supabase
        .from("events")
        .select("id, title, slug, event_date, event_end_date, location, status")
        .eq("branch_id", currentBranch.id)
        .neq("status", "cancelled")
        .order("event_date", { ascending: true }),
    ]);

    if (!holidaysRes.error && holidaysRes.data) {
      setHolidays(holidaysRes.data as unknown as Holiday[]);
    }
    if (!eventsRes.error && eventsRes.data) {
      setEvents(eventsRes.data as unknown as CalendarEvent[]);
    }
    setIsLoading(false);
  }, [currentBranch]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Build a map of date -> events occurring on that date (events can span days)
  const eventDateMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((ev) => {
      try {
        const start = parseISO(ev.event_date);
        const end = ev.event_end_date ? parseISO(ev.event_end_date) : start;
        const days = eachDayOfInterval({ start, end });
        days.forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          const arr = map.get(key) || [];
          arr.push(ev);
          map.set(key, arr);
        });
      } catch {
        // ignore malformed dates
      }
    });
    return map;
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((e) => {
        const end = e.event_end_date ? parseISO(e.event_end_date) : parseISO(e.event_date);
        return !isBefore(end, today);
      })
      .slice(0, 6);
  }, [events]);

  // Public share URL for the read-only calendar
  const shareUrl = useMemo(() => {
    if (!currentBranch) return "";
    const slug = (currentBranch as any).slug || currentBranch.id;
    return buildPublicUrl(`/b/${slug}/calendar`, customDomain?.hostname);
  }, [currentBranch, customDomain]);

  const handleShareCalendar = () => {
    if (!shareUrl) {
      toast.error("Calendar link is not ready yet");
      return;
    }
    setIsShareDialogOpen(true);
  };

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
      msg += `\n\n⏰ *Closed:* ${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
    } else if (type === "half_day") {
      msg += `open for *half day* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Timings:* ${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
    } else if (type === "late_opening") {
      msg += `opening *late* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Opens at:* ${formatTime12h(openTime)}`;
    } else if (type === "early_closing") {
      msg += `closing *early* on *${dateStr}*`;
      msg += ` for *${name}*.\n\n`;
      msg += `⏰ *Closes at:* ${formatTime12h(closeTime)}`;
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
    setFormOpenTime("06:00");
    setFormCloseTime("22:00");
    setFormNotify(holiday.notify_members);
    setFormWhatsAppMessage("");
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

      // Send WhatsApp notifications to all active members if notify is enabled
      if (formNotify && formWhatsAppMessage.trim()) {
        setIsDialogOpen(false);
        await sendHolidayNotifications();
      } else {
        setIsDialogOpen(false);
      }

      fetchHolidays();
    } finally {
      setIsSaving(false);
    }
  };

  // Send holiday WhatsApp notification to all active members
  const sendHolidayNotifications = async () => {
    if (!currentBranch?.id || !formWhatsAppMessage.trim()) return;

    const started = whatsAppOverlay.startSending("all active members");
    if (!started) return;

    try {
      // Fetch all active members for this branch
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, name, phone, subscriptions(status)")
        .eq("branch_id", currentBranch.id);

      if (membersError || !members?.length) {
        whatsAppOverlay.markError("No members found to notify");
        return;
      }

      // Filter to members with active/expiring_soon subscriptions
      const activeMembers = members.filter((m: any) => {
        const subs = m.subscriptions || [];
        return subs.some((s: any) => s.status === "active" || s.status === "expiring_soon");
      });

      if (activeMembers.length === 0) {
        whatsAppOverlay.markError("No active members found to notify");
        return;
      }

      const memberIds = activeMembers.map((m: any) => m.id);

      // Send via send-whatsapp edge function with custom message
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          memberIds,
          type: "custom",
          customMessage: formWhatsAppMessage,
          isManual: false,
          adminUserId: session?.user?.id || null,
          branchId: currentBranch.id,
          branchName: currentBranch.name,
        },
      });

      if (error) {
        whatsAppOverlay.markError("Failed to send notifications");
        console.error("Holiday WhatsApp error:", error);
      } else {
        const successCount = data?.results?.filter((r: any) => r.success).length || 0;
        const failCount = data?.results?.filter((r: any) => !r.success).length || 0;
        
        if (failCount > 0) {
          whatsAppOverlay.markSuccess();
          toast.info(`Sent to ${successCount} members, ${failCount} failed`);
        } else {
          whatsAppOverlay.markSuccess();
          toast.success(`Holiday notice sent to ${successCount} active members`);
        }
      }
    } catch (err: any) {
      console.error("Holiday notification error:", err);
      whatsAppOverlay.markError(err.message || "Failed to send notifications");
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
    <div className="space-y-3 lg:space-y-6 overflow-x-hidden">
      {/* Calendar Card */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 lg:gap-3">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex-shrink-0">
                <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm lg:text-xl">Calendar</CardTitle>
                <CardDescription className="text-[11px] lg:text-sm leading-snug">Holidays & events at a glance — tap any date to manage</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none gap-1.5 rounded-xl h-8 lg:h-9 text-xs lg:text-sm border-primary/30 text-primary hover:bg-primary/5 hover:text-primary hover:border-primary/50 transition-all"
                onClick={handleShareCalendar}
                disabled={!shareUrl}
                title="Share calendar with members"
              >
                <ShareIcon className="w-3.5 h-3.5" />
                <span className="sm:hidden">Share</span>
                <span className="hidden sm:inline">Share Calendar</span>
              </Button>
              <Button
                size="sm"
                className="flex-1 sm:flex-none gap-1.5 rounded-xl h-8 lg:h-9 text-xs lg:text-sm"
                onClick={() => openAddDialog(new Date())}
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add Holiday</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 lg:p-6 pt-1 lg:pt-2">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-2.5 lg:mb-4">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeftIcon className="w-4 h-4" />
            </Button>
            <h3 className="font-semibold text-sm lg:text-base">{format(currentMonth, "MMMM yyyy")}</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 lg:gap-1 mb-1.5">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-[10px] lg:text-xs font-semibold text-muted-foreground/80 py-1 lg:py-1.5 uppercase tracking-wider">
                <span className="lg:hidden">{day.charAt(0)}</span>
                <span className="hidden lg:inline">{day}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1 lg:gap-1.5">
            {/* Empty cells for padding */}
            {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[68px] sm:min-h-[72px] lg:min-h-[100px]" />
            ))}

            {calendarDays.days.map((day, idx) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const gymHoliday = holidayDateSet.get(dateStr);
              const nationalHoliday = nationalHolidayMap.get(dateStr);
              const dayEvents = eventDateMap.get(dateStr) || [];
              const hasEvent = dayEvents.length > 0;
              const isCurrentDay = isToday(day);
              const isPast = isBefore(day, startOfDay(new Date())) && !isCurrentDay;
              const isSunday = getDay(day) === 0;
              const hasHoliday = !!(gymHoliday || nationalHoliday);

              return (
                <div
                  key={dateStr}
                  className="relative group animate-fade-in"
                  style={{ animationDelay: `${Math.min(idx * 8, 240)}ms`, animationFillMode: "both" }}
                >
                  <button
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      "w-full min-h-[68px] sm:min-h-[72px] lg:min-h-[100px] rounded-lg lg:rounded-xl flex flex-col items-stretch p-1 sm:p-1.5 lg:p-2 relative text-xs lg:text-sm overflow-hidden",
                      "border border-transparent",
                      "transition-all duration-200 ease-out",
                      "active:scale-95 lg:hover:scale-[1.02] lg:hover:shadow-md lg:hover:z-10",
                      isPast && "opacity-50",
                      // Normal day
                      !hasHoliday && !isCurrentDay && !hasEvent && "hover:bg-muted/60 hover:border-border/40",
                      !hasHoliday && !isCurrentDay && hasEvent && "bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/30 border-blue-500/20",
                      // Today
                      isCurrentDay && !gymHoliday && "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30 ring-1 ring-primary/20 font-bold",
                      // Gym holiday
                      gymHoliday && "bg-destructive/8 hover:bg-destructive/14 border-destructive/20",
                      // National holiday
                      !gymHoliday && nationalHoliday && "bg-orange-500/8 hover:bg-orange-500/14 border-orange-500/20",
                      // Sunday text
                      isSunday && !gymHoliday && !nationalHoliday && "text-destructive/60",
                    )}
                  >
                    {/* Top row: date + today badge */}
                    <div className="flex items-center justify-between leading-none gap-0.5">
                      <span className={cn(
                        "text-[11px] sm:text-xs lg:text-sm leading-none",
                        isCurrentDay && !gymHoliday && "text-primary font-bold",
                        gymHoliday && "text-destructive font-semibold",
                        !gymHoliday && nationalHoliday && "text-orange-600 dark:text-orange-400 font-semibold",
                        !hasHoliday && !isCurrentDay && "font-medium",
                      )}>
                        {format(day, "d")}
                      </span>
                      {isCurrentDay && (
                        <span className="hidden lg:inline-block text-[8px] uppercase tracking-wide font-bold text-primary bg-primary/15 px-1 py-0.5 rounded leading-none">
                          Today
                        </span>
                      )}
                      {isCurrentDay && (
                        <span className="lg:hidden text-[7px] uppercase font-bold text-primary bg-primary/20 px-1 py-px rounded leading-none">
                          Now
                        </span>
                      )}
                    </div>

                    {/* Holiday name (desktop) */}
                    {gymHoliday && (
                      <span className="hidden lg:block text-[9px] leading-tight px-1 mt-1 line-clamp-1 text-destructive font-semibold uppercase tracking-wide">
                        {gymHoliday.holiday_type === "full_day" ? "🚫 Closed" : "⏰ Half Day"}
                      </span>
                    )}
                    {gymHoliday && (
                      <span className="hidden lg:block text-[9px] leading-tight px-1 line-clamp-1 text-destructive/80">
                        {gymHoliday.holiday_name}
                      </span>
                    )}
                    {!gymHoliday && nationalHoliday && (
                      <span className="hidden lg:block text-[9px] leading-tight px-1 mt-1 line-clamp-2 text-orange-600 dark:text-orange-400 font-medium">
                        {nationalHoliday}
                      </span>
                    )}

                    {/* Mobile/tablet: name pills (gym holiday > national > event) */}
                    <div className="lg:hidden flex flex-col gap-0.5 mt-1 min-w-0">
                      {gymHoliday && (
                        <span className="text-[8px] sm:text-[9px] leading-tight px-1 py-0.5 rounded bg-destructive/15 text-destructive font-semibold truncate text-center">
                          {gymHoliday.holiday_name}
                        </span>
                      )}
                      {!gymHoliday && nationalHoliday && (
                        <span className="text-[8px] sm:text-[9px] leading-tight px-1 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 font-semibold truncate text-center">
                          {nationalHoliday}
                        </span>
                      )}
                      {hasEvent && dayEvents.slice(0, gymHoliday || nationalHoliday ? 1 : 2).map((ev) => (
                        <span
                          key={ev.id}
                          className="text-[8px] sm:text-[9px] leading-tight px-1 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium truncate text-center"
                        >
                          {ev.title}
                        </span>
                      ))}
                      {hasEvent && dayEvents.length > (gymHoliday || nationalHoliday ? 1 : 2) && (
                        <span className="text-[7px] text-blue-600 dark:text-blue-400 font-semibold leading-none text-center">
                          +{dayEvents.length - (gymHoliday || nationalHoliday ? 1 : 2)}
                        </span>
                      )}
                    </div>

                    {/* Desktop: event pills inside the cell */}
                    {hasEvent && (
                      <div className="hidden lg:flex flex-col gap-0.5 mt-auto pt-1">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className="text-left text-[9px] leading-tight px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 truncate font-medium border border-blue-500/20"
                            title={ev.title}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold px-1 leading-none">
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>

                  {/* Hover Tooltip (mobile + extra detail) */}
                  {(hasHoliday || hasEvent) && (
                    <div className="hidden lg:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-foreground text-background text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 shadow-lg max-w-[240px] animate-fade-in">
                      {hasHoliday && (
                        <div className="whitespace-nowrap">
                          <span className="font-medium">{gymHoliday?.holiday_name || nationalHoliday}</span>
                          {gymHoliday && (
                            <span className="ml-1 opacity-70 text-[9px]">· {gymHoliday.holiday_type === "full_day" ? "Closed" : "Half Day"}</span>
                          )}
                        </div>
                      )}
                      {hasEvent && dayEvents.map((ev) => (
                        <div key={ev.id} className={cn("flex items-center gap-1 whitespace-nowrap", hasHoliday && "mt-0.5 pt-0.5 border-t border-background/20")}>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          <span className="font-medium truncate">{ev.title}</span>
                        </div>
                      ))}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-x-3 gap-y-2 mt-3 lg:mt-4 pt-2.5 lg:pt-3 border-t border-border/30 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-blue-500" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Event</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-red-500" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Gym Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-orange-400" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">National Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full ring-2 ring-primary/30 bg-primary/20" />
              <span className="text-[10px] lg:text-xs text-muted-foreground">Today</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
              <TicketIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm lg:text-xl">Upcoming Events</CardTitle>
              <CardDescription className="text-[11px] lg:text-sm leading-snug">Events scheduled at this branch</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1].map(i => (
                <div key={i} className="h-16 bg-muted/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="text-center py-8">
              <TicketIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No upcoming events</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Create events from the Events page</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map(ev => {
                const date = parseISO(ev.event_date);
                return (
                  <button
                    key={ev.id}
                    onClick={() => navigate(`/admin/events/${ev.id}`)}
                    className="w-full flex items-center justify-between gap-2 lg:gap-3 p-2.5 lg:p-4 rounded-lg lg:rounded-xl border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 text-left overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
                      <div className="flex flex-col items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-blue-500/10 text-blue-600 flex-shrink-0">
                        <span className="text-[10px] lg:text-xs font-medium leading-none">{format(date, "MMM")}</span>
                        <span className="text-sm lg:text-base font-bold leading-tight">{format(date, "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs lg:text-sm truncate">{ev.title}</p>
                        <div className="flex items-center gap-1.5 lg:gap-2 mt-0.5 text-[10px] lg:text-[11px] text-muted-foreground min-w-0">
                          <span className="flex-shrink-0">{format(date, "EEE, h:mm a")}</span>
                          {ev.location && <span className="truncate">· {ev.location}</span>}
                        </div>
                      </div>
                    </div>
                    <ChevronRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Holidays */}
      <Card className="border border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
              <SparklesIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm lg:text-xl">Upcoming Holidays</CardTitle>
              <CardDescription className="text-[11px] lg:text-sm leading-snug">Next scheduled gym closures</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
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
                      "flex items-center justify-between gap-2 p-2.5 lg:p-4 rounded-lg lg:rounded-xl border border-border/30 transition-all duration-200 hover:shadow-sm hover:border-border/50 overflow-hidden",
                      isUpcoming && "bg-red-500/5 border-red-500/20"
                    )}
                  >
                    <div className="flex items-center gap-2.5 lg:gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "flex flex-col items-center justify-center w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl text-center flex-shrink-0",
                        isUpcoming ? "bg-red-500/10 text-red-600" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <span className="text-[10px] lg:text-xs font-medium leading-none">{format(date, "MMM")}</span>
                        <span className="text-sm lg:text-base font-bold leading-tight">{format(date, "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs lg:text-sm truncate">{holiday.holiday_name}</p>
                        <div className="flex items-center gap-1.5 lg:gap-2 mt-0.5 flex-wrap">
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
                                {formatTime12h(holiday.half_day_start_time)} – {formatTime12h(holiday.half_day_end_time)}
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
                    <div className="flex items-center gap-0.5 lg:gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 lg:h-8 lg:w-8 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(holiday)}
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 lg:h-8 lg:w-8 rounded-lg text-muted-foreground hover:text-destructive"
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
        <CardHeader className="p-3 lg:p-6 pb-2 lg:pb-4">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
              <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm lg:text-xl">National Holidays {currentYear}</CardTitle>
              <CardDescription className="text-[11px] lg:text-sm leading-snug">Quick-add Indian national holidays to your calendar</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 lg:p-6 pt-0 lg:pt-0">
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
                      "flex items-center gap-2.5 lg:gap-3 p-2.5 lg:p-3 rounded-lg lg:rounded-xl border border-border/30 text-left transition-all duration-200 overflow-hidden",
                      alreadyAdded
                        ? "opacity-50 cursor-not-allowed bg-muted/20"
                        : "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm active:scale-[0.98]"
                    )}
                  >
                    <div className="flex flex-col items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-orange-500/10 text-orange-600 text-center flex-shrink-0">
                      <span className="text-[9px] font-medium leading-none">{format(parseISO(holiday.date), "MMM")}</span>
                      <span className="text-sm font-bold leading-tight">{format(parseISO(holiday.date), "d")}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs lg:text-sm truncate">{holiday.name}</p>
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <SelectItem value="half_day">⏰ Half Day (Custom Timings)</SelectItem>
                  <SelectItem value="late_opening">🌅 Late Opening</SelectItem>
                  <SelectItem value="early_closing">🌆 Early Closing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Closure Timings */}
            <div className="p-3 bg-muted/30 border border-border/40 rounded-xl space-y-3">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5" />
                {formType === "full_day" ? "Closed From – To" : formType === "half_day" ? "Open Timings (Half Day)" : formType === "late_opening" ? "Late Opening Time" : "Early Closing Time"}
              </p>
              {(formType === "full_day" || formType === "half_day") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{formType === "full_day" ? "Closed From" : "Open From"}</Label>
                    <TimePicker12h value={formStartTime} onChange={setFormStartTime} size="md" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{formType === "full_day" ? "Closed Till" : "Close At"}</Label>
                    <TimePicker12h value={formEndTime} onChange={setFormEndTime} size="md" />
                  </div>
                </div>
              )}
              {formType === "late_opening" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Opens At</Label>
                  <TimePicker12h value={formOpenTime} onChange={setFormOpenTime} size="md" />
                </div>
              )}
              {formType === "early_closing" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Closes At</Label>
                  <TimePicker12h value={formCloseTime} onChange={setFormCloseTime} size="md" />
                </div>
              )}
              <p className="text-[9px] text-muted-foreground">
                {formType === "full_day" ? "Specify when the gym will be closed (e.g. entire day 6 AM to 10 PM)" : formType === "half_day" ? "Specify the hours the gym will remain open" : formType === "late_opening" ? "Gym will open later than usual" : "Gym will close earlier than usual"}
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

            {/* Notify Members Toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/20 border border-border/40 rounded-xl">
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">Notify Members via WhatsApp</p>
                  <p className="text-[10px] lg:text-xs text-muted-foreground">Send holiday notice to all active members</p>
                </div>
                <Switch checked={formNotify} onCheckedChange={setFormNotify} />
              </div>

              {/* WhatsApp Message Preview */}
              {formNotify && formWhatsAppMessage && (
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
                      Message Preview
                    </p>
                    <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">Editable</span>
                  </div>
                  <Textarea
                    value={formWhatsAppMessage}
                    onChange={e => setFormWhatsAppMessage(e.target.value)}
                    className="min-h-[120px] rounded-lg text-xs bg-background/80 font-mono leading-relaxed resize-y"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    This message will be sent to all active members via WhatsApp. You can customize it above.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formName.trim() || (
              editingHoliday &&
              formName === editingHoliday.holiday_name &&
              formDescription === (editingHoliday.description || "") &&
              formType === editingHoliday.holiday_type &&
              formStartTime === (editingHoliday.half_day_start_time || "09:00") &&
              formEndTime === (editingHoliday.half_day_end_time || "13:00") &&
              formNotify === editingHoliday.notify_members &&
              (selectedDate ? format(selectedDate, "yyyy-MM-dd") : "") === editingHoliday.holiday_date
            )} className="gap-2 rounded-xl">
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

      <WhatsAppSendingOverlay {...whatsAppOverlay.overlayProps} />

      <ShareCalendarDialog
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        shareUrl={shareUrl}
      />
    </div>
  );
};

export default HolidayCalendarTab;
