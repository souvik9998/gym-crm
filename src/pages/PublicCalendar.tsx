import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveBranch } from "@/lib/slugResolver";
import { useDomainContext } from "@/contexts/DomainContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BranchLogo } from "@/components/admin/BranchLogo";
import PoweredByBadge from "@/components/PoweredByBadge";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  TicketIcon,
  ChevronDownIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  isBefore,
  startOfDay,
} from "date-fns";
import { cn } from "@/lib/utils";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  event_date: string;
  event_end_date: string | null;
  location: string | null;
  status: string;
  description: string | null;
}

interface PublicHoliday {
  id: string;
  holiday_name: string;
  holiday_date: string;
  description: string | null;
  holiday_type: string;
  half_day_start_time: string | null;
  half_day_end_time: string | null;
}

interface BranchInfo {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12h = (time: string | null | undefined): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

export default function PublicCalendar() {
  const params = useParams<{ branchSlug?: string }>();
  const { branchId: domainBranchId } = useDomainContext();

  const [branch, setBranch] = useState<BranchInfo | null>(null);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Resolve branch from URL slug, or from custom domain context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      let resolved: BranchInfo | null = null;

      if (params.branchSlug) {
        resolved = await resolveBranch(params.branchSlug);
      } else if (domainBranchId) {
        const { data } = await supabase
          .from("branches")
          .select("id, slug, name, logo_url")
          .eq("id", domainBranchId)
          .maybeSingle();
        resolved = data as BranchInfo | null;
      }

      if (cancelled) return;
      if (!resolved) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      setBranch(resolved);

      const [holidaysRes, eventsRes] = await Promise.all([
        supabase
          .from("gym_holidays")
          .select("id, holiday_name, holiday_date, description, holiday_type, half_day_start_time, half_day_end_time")
          .eq("branch_id", resolved.id)
          .order("holiday_date", { ascending: true }),
        supabase
          .from("events")
          .select("id, title, slug, event_date, event_end_date, location, status, description")
          .eq("branch_id", resolved.id)
          .neq("status", "cancelled")
          .order("event_date", { ascending: true }),
      ]);

      if (cancelled) return;
      setHolidays((holidaysRes.data || []) as PublicHoliday[]);
      setEvents((eventsRes.data || []) as PublicEvent[]);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.branchSlug, domainBranchId]);

  const eventDateMap = useMemo(() => {
    const map = new Map<string, PublicEvent[]>();
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
        // ignore
      }
    });
    return map;
  }, [events]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, PublicHoliday>();
    holidays.forEach((h) => map.set(h.holiday_date, h));
    return map;
  }, [holidays]);

  const isEventPast = (ev: PublicEvent): boolean => {
    const today = startOfDay(new Date());
    const end = ev.event_end_date ? parseISO(ev.event_end_date) : parseISO(ev.event_date);
    return isBefore(end, today);
  };

  const isHolidayPast = (h: PublicHoliday): boolean => {
    const today = startOfDay(new Date());
    return isBefore(parseISO(h.holiday_date), today);
  };

  const upcomingEvents = useMemo(() => {
    return events.filter((e) => !isEventPast(e)).slice(0, 8);
  }, [events]);

  const pastEvents = useMemo(() => {
    return events
      .filter((e) => isEventPast(e))
      .slice()
      .reverse() // most recent past first
      .slice(0, 8);
  }, [events]);

  const upcomingHolidays = useMemo(() => {
    return holidays.filter((h) => !isHolidayPast(h)).slice(0, 8);
  }, [holidays]);

  const pastHolidays = useMemo(() => {
    return holidays
      .filter((h) => isHolidayPast(h))
      .slice()
      .reverse()
      .slice(0, 8);
  }, [holidays]);

  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showPastHolidays, setShowPastHolidays] = useState(false);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startPadding = getDay(monthStart);
    return { days, startPadding };
  }, [currentMonth]);

  const eventLink = (ev: PublicEvent) => `/event/${ev.slug}`;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-full max-w-md px-4">
          <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-72 bg-muted/40 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound || !branch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-center">
        <div>
          <CalendarDaysIcon className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <h1 className="text-lg font-semibold mb-1">Calendar not available</h1>
          <p className="text-sm text-muted-foreground">This branch doesn't have a public calendar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/30 backdrop-blur sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <BranchLogo logoUrl={branch.logo_url} name={branch.name} size="md" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">{branch.name}</h1>
            <p className="text-xs text-muted-foreground">Calendar — Holidays & Events</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        {/* Calendar */}
        <Card className="border border-border/40 shadow-sm overflow-hidden">
          <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-primary/10 text-primary">
                <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div>
                <CardTitle className="text-base lg:text-xl">{format(currentMonth, "MMMM yyyy")}</CardTitle>
                <CardDescription className="text-xs lg:text-sm">
                  <span className="lg:hidden">Tap a date to see events & holidays</span>
                  <span className="hidden lg:inline">Hover or tap a date for details</span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 lg:p-6 pt-2 lg:pt-2">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeftIcon className="w-4 h-4" />
              </Button>
              <h3 className="font-semibold text-sm lg:text-base">{format(currentMonth, "MMMM yyyy")}</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[10px] lg:text-xs font-medium text-muted-foreground py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1 lg:gap-1.5">
              {Array.from({ length: calendarDays.startPadding }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[44px] sm:min-h-[60px] lg:min-h-[100px]" />
              ))}
              {calendarDays.days.map((day, idx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const holiday = holidayMap.get(dateStr);
                const dayEvents = eventDateMap.get(dateStr) || [];
                const hasEvent = dayEvents.length > 0;
                const isCurrent = isToday(day);
                const isPast = isBefore(day, startOfDay(new Date())) && !isCurrent;
                const isSunday = getDay(day) === 0;
                const isSelected = selectedDate === dateStr;
                const hasAnything = !!holiday || hasEvent;

                // Cell wrapper: link if a single event on desktop, button on mobile
                const singleEvent = dayEvents.length === 1 ? dayEvents[0] : null;

                return (
                  <div
                    key={dateStr}
                    className="relative group animate-fade-in"
                    style={{ animationDelay: `${Math.min(idx * 8, 240)}ms`, animationFillMode: "both" }}
                  >
                    {/* MOBILE / TABLET cell — compact, tap to select */}
                    <button
                      type="button"
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={cn(
                        "lg:hidden block w-full min-h-[44px] sm:min-h-[60px] rounded-lg flex flex-col items-center justify-start p-1 sm:p-1.5 relative overflow-hidden",
                        "border transition-all duration-200 ease-out active:scale-95",
                        isPast && !isSelected && "opacity-60",
                        // Default
                        !holiday && !isCurrent && !hasEvent && "bg-muted/20 border-transparent",
                        // Has event (no holiday)
                        !holiday && !isCurrent && hasEvent && "bg-blue-500/10 border-blue-500/25",
                        // Holiday
                        holiday && !isCurrent && "bg-destructive/10 border-destructive/25",
                        // Today
                        isCurrent && !holiday && "bg-primary/15 border-primary/40 ring-1 ring-primary/30",
                        isCurrent && holiday && "border-primary/50 ring-1 ring-primary/40",
                        // Selected
                        isSelected && "ring-2 ring-primary border-primary scale-[1.04] shadow-md z-10",
                        isSunday && !holiday && !hasEvent && "text-destructive/70",
                      )}
                      aria-label={`${format(day, "EEEE, MMMM d")}${holiday ? ` — ${holiday.holiday_name}` : ""}${hasEvent ? ` — ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
                    >
                      <span className={cn(
                        "text-xs sm:text-sm leading-none mt-0.5",
                        isCurrent && "text-primary font-bold",
                        holiday && !isCurrent && "text-destructive font-semibold",
                        !holiday && !isCurrent && "font-medium",
                      )}>
                        {format(day, "d")}
                      </span>

                      {/* Dot indicators row */}
                      {hasAnything && (
                        <div className="flex items-center gap-0.5 mt-auto mb-0.5">
                          {holiday && (
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                          )}
                          {hasEvent && dayEvents.slice(0, 3).map((ev, i) => (
                            <span key={ev.id + i} className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          ))}
                          {hasEvent && dayEvents.length > 3 && (
                            <span className="text-[8px] text-blue-600 dark:text-blue-400 font-bold leading-none">+</span>
                          )}
                        </div>
                      )}
                    </button>

                    {/* DESKTOP cell — unchanged */}
                    {(() => {
                      const Wrapper: any = singleEvent ? "a" : "div";
                      const wrapperProps = singleEvent
                        ? { href: eventLink(singleEvent), title: singleEvent.title }
                        : {};
                      return (
                        <Wrapper
                          {...wrapperProps}
                          className={cn(
                            "hidden lg:flex w-full min-h-[100px] rounded-xl flex-col items-stretch p-2 relative text-sm overflow-hidden",
                            "border border-transparent transition-all duration-200 ease-out",
                            (singleEvent || hasEvent) && "cursor-pointer hover:scale-[1.02] hover:shadow-md hover:z-10",
                            isPast && "opacity-50",
                            !holiday && !isCurrent && !hasEvent && "bg-muted/20",
                            !holiday && !isCurrent && hasEvent && "bg-blue-500/8 hover:bg-blue-500/12 hover:border-blue-500/30",
                            isCurrent && !holiday && "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30 ring-1 ring-primary/20 font-bold",
                            holiday && "bg-destructive/8 hover:bg-destructive/14 border-destructive/20",
                            isSunday && !holiday && "text-destructive/60",
                          )}
                        >
                          <div className="flex items-center justify-between leading-none">
                            <span className={cn(
                              "text-sm leading-none",
                              isCurrent && !holiday && "text-primary font-bold",
                              holiday && "text-destructive font-semibold",
                              !holiday && !isCurrent && "font-medium",
                            )}>
                              {format(day, "d")}
                            </span>
                            {isCurrent && (
                              <span className="inline-block text-[8px] uppercase tracking-wide font-bold text-primary bg-primary/15 px-1 py-0.5 rounded leading-none">
                                Today
                              </span>
                            )}
                          </div>

                          {holiday && (
                            <span className="block text-[9px] leading-tight px-1 mt-1 line-clamp-1 text-destructive font-semibold uppercase tracking-wide">
                              {holiday.holiday_type === "full_day" ? "🚫 Closed" : "⏰ Half Day"}
                            </span>
                          )}
                          {holiday && (
                            <span className="block text-[9px] leading-tight px-1 line-clamp-1 text-destructive/80">
                              {holiday.holiday_name}
                            </span>
                          )}

                          {hasEvent && (
                            <div className="flex flex-col gap-0.5 mt-auto pt-1">
                              {dayEvents.slice(0, 2).map((ev) => (
                                <a
                                  key={ev.id}
                                  href={eventLink(ev)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-left text-[9px] leading-tight px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 truncate font-medium border border-blue-500/20 hover:bg-blue-500/25 transition-colors"
                                  title={ev.title}
                                >
                                  {ev.title}
                                </a>
                              ))}
                              {dayEvents.length > 2 && (
                                <div className="text-[8px] text-blue-600 dark:text-blue-400 font-semibold px-1 leading-none">
                                  +{dayEvents.length - 2} more
                                </div>
                              )}
                            </div>
                          )}
                        </Wrapper>
                      );
                    })()}

                    {/* Hover Tooltip (desktop only) */}
                    {(holiday || hasEvent) && (
                      <div className="hidden lg:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-foreground text-background text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-30 shadow-lg max-w-[240px] animate-fade-in">
                        {holiday && (
                          <div className="whitespace-nowrap">
                            <span className="font-medium">{holiday.holiday_name}</span>
                            <span className="ml-1 opacity-70 text-[9px]">· {holiday.holiday_type === "full_day" ? "Closed" : "Half Day"}</span>
                          </div>
                        )}
                        {hasEvent && dayEvents.map((ev) => (
                          <div key={ev.id} className={cn("flex items-center gap-1 whitespace-nowrap", holiday && "mt-0.5 pt-0.5 border-t border-background/20")}>
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

            {/* MOBILE selected date details panel */}
            {selectedDate && (() => {
              const selDate = parseISO(selectedDate);
              const selHoliday = holidayMap.get(selectedDate);
              const selEvents = eventDateMap.get(selectedDate) || [];
              const isEmpty = !selHoliday && selEvents.length === 0;
              return (
                <div className="lg:hidden mt-3 rounded-xl border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 p-3 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                        <span className="text-[9px] font-medium leading-none uppercase">{format(selDate, "MMM")}</span>
                        <span className="text-sm font-bold leading-tight">{format(selDate, "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{format(selDate, "EEEE")}</p>
                        <p className="text-[11px] text-muted-foreground leading-tight">{format(selDate, "d MMM yyyy")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(null)}
                      className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
                      aria-label="Close details"
                    >
                      Close
                    </button>
                  </div>

                  {isEmpty && (
                    <p className="text-xs text-muted-foreground text-center py-3">No events or holidays on this day.</p>
                  )}

                  {selHoliday && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 mb-2">
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{selHoliday.holiday_type === "full_day" ? "🚫" : "⏰"}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-destructive leading-tight">{selHoliday.holiday_name}</p>
                          <p className="text-[11px] text-destructive/80 mt-0.5">
                            {selHoliday.holiday_type === "full_day"
                              ? "Gym Closed — Full Day"
                              : `Half Day · ${formatTime12h(selHoliday.half_day_start_time)} – ${formatTime12h(selHoliday.half_day_end_time)}`}
                          </p>
                          {selHoliday.description && (
                            <p className="text-[11px] text-muted-foreground mt-1">{selHoliday.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selEvents.length > 0 && (
                    <div className="space-y-1.5">
                      {selEvents.map((ev) => (
                        <a
                          key={ev.id}
                          href={eventLink(ev)}
                          className="flex items-center gap-2 p-2 rounded-lg border border-blue-500/20 bg-blue-500/5 active:scale-[0.98] transition-transform"
                        >
                          <div className="w-1 h-9 rounded-full bg-blue-500 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate text-foreground">{ev.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <ClockIcon className="w-2.5 h-2.5" />
                                {format(parseISO(ev.event_date), "h:mm a")}
                              </span>
                              {ev.location && (
                                <span className="flex items-center gap-0.5 truncate">
                                  <MapPinIcon className="w-2.5 h-2.5" />
                                  <span className="truncate">{ev.location}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRightIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/30 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-[10px] lg:text-xs text-muted-foreground">Event</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-[10px] lg:text-xs text-muted-foreground">Holiday</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary/40 ring-2 ring-primary/30" />
                <span className="text-[10px] lg:text-xs text-muted-foreground">Today</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card className="border border-border/40 shadow-sm overflow-hidden">
          <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <TicketIcon className="w-4 h-4 lg:w-5 lg:h-5" />
              </div>
              <div>
                <CardTitle className="text-base lg:text-xl">Upcoming Events</CardTitle>
                <CardDescription className="text-xs lg:text-sm">Tap to view & register</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((ev) => {
                  const start = parseISO(ev.event_date);
                  return (
                    <a
                      key={ev.id}
                      href={eventLink(ev)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all"
                    >
                      <div className="flex flex-col items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-xl bg-blue-500/10 text-blue-600">
                        <span className="text-[10px] lg:text-xs font-medium leading-none">{format(start, "MMM")}</span>
                        <span className="text-sm lg:text-base font-bold leading-tight">{format(start, "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{ev.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            {format(start, "h:mm a")}
                          </span>
                          {ev.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPinIcon className="w-3 h-3" />
                              <span className="truncate">{ev.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        {upcomingHolidays.length > 0 && (
          <Card className="border border-border/40 shadow-sm overflow-hidden">
            <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <CalendarDaysIcon className="w-4 h-4 lg:w-5 lg:h-5" />
                </div>
                <div>
                  <CardTitle className="text-base lg:text-xl">Upcoming Holidays</CardTitle>
                  <CardDescription className="text-xs lg:text-sm">Scheduled gym closures</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0">
              <div className="space-y-2">
                {upcomingHolidays.map((h) => {
                  const date = parseISO(h.holiday_date);
                  return (
                    <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30">
                      <div className="flex flex-col items-center justify-center w-11 h-11 lg:w-12 lg:h-12 rounded-xl bg-red-500/10 text-red-600">
                        <span className="text-[10px] lg:text-xs font-medium leading-none">{format(date, "MMM")}</span>
                        <span className="text-sm lg:text-base font-bold leading-tight">{format(date, "d")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{h.holiday_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] lg:text-xs px-1.5 py-0.5 rounded-md",
                            h.holiday_type === "full_day" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600",
                          )}>
                            {h.holiday_type === "full_day" ? "Full Day" : (
                              <>
                                <ClockIcon className="w-3 h-3" />
                                {formatTime12h(h.half_day_start_time)} – {formatTime12h(h.half_day_end_time)}
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <PoweredByBadge />
    </div>
  );
}
