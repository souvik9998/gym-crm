import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvalidateQueries } from "@/hooks/useQueryCache";
import { MemberHealthTab } from "./health/MemberHealthTab";
import { AssignTrainerDialog } from "./AssignTrainerDialog";
import { AddMemberDialog, type ExistingMember as RenewalExistingMember } from "./AddMemberDialog";
import { TransferSlotDialog } from "./staff/timeslots/TransferSlotDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar, 
  CreditCard, 
  IndianRupee, 
  User, 
  Phone, 
  MapPin,
  IdCard,
  Dumbbell,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  UserX,
  Mail,
  TrendingUp,
  Wallet,
  Plus,
  RefreshCw,
  MessageCircle,
  Loader2 as Spinner,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MemberActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null;
  memberName: string;
}

interface Subscription {
  id: string;
  start_date: string;
  end_date: string;
  plan_months: number;
  status: string;
  trainer_fee: number | null;
  is_custom_package: boolean | null;
  custom_days: number | null;
  personal_trainer?: { name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_mode: string;
  status: string;
  created_at: string;
  notes: string | null;
  payment_type: string | null;
}

interface PTSubscription {
  id: string;
  start_date: string;
  end_date: string;
  monthly_fee: number;
  total_fee: number;
  status: string;
  personal_trainer: { id: string; name: string; specialization: string | null } | null;
  time_slot: { id: string; start_time: string; end_time: string } | null;
  time_slot_id: string | null;
  branch_id: string | null;
}

interface MemberDetails {
  gender: string | null;
  address: string | null;
  photo_id_type: string | null;
  photo_id_number: string | null;
  date_of_birth: string | null;
  personal_trainer?: { name: string } | null;
}

interface MemberData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  join_date: string;
  branch_id: string;
}

// Staggered animation wrapper
const AnimatedItem = ({ children, index, className }: { children: React.ReactNode; index: number; className?: string }) => (
  <div
    className={cn("opacity-0", className)}
    style={{
      animation: `memberDialogFadeSlide 0.4s ease-out forwards`,
      animationDelay: `${index * 80}ms`,
    }}
  >
    {children}
  </div>
);

export const MemberActivityDialog = ({
  open,
  onOpenChange,
  memberId,
  memberName,
}: MemberActivityDialogProps) => {
  const [member, setMember] = useState<MemberData | null>(null);
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ptSubscriptions, setPtSubscriptions] = useState<PTSubscription[]>([]);
  const [activePT, setActivePT] = useState<PTSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAssignTrainer, setShowAssignTrainer] = useState(false);
  const [showRenewMember, setShowRenewMember] = useState(false);
  const [assignMode, setAssignMode] = useState<"assign" | "replace" | "extend">("assign");
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState<string | null>(null);
  const [assigningSlotForPt, setAssigningSlotForPt] = useState<PTSubscription | null>(null);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [isSavingSlot, setIsSavingSlot] = useState(false);
  const [transferringPt, setTransferringPt] = useState<PTSubscription | null>(null);
  const { invalidatePtSubscriptions } = useInvalidateQueries();

  useEffect(() => {
    if (open && memberId) {
      setActiveTab("overview");
      fetchMemberData();
    }
  }, [open, memberId]);

  const fetchMemberData = async () => {
    if (!memberId) return;
    setIsLoading(true);

    try {
      const { data: memberData } = await supabase
        .from("members")
        .select("*")
        .eq("id", memberId)
        .single();

      if (memberData) setMember(memberData);

      const { data: detailsData } = await supabase
        .from("member_details")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", memberId)
        .maybeSingle();

      if (detailsData) setDetails(detailsData);

      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (subsData) setSubscriptions(subsData);

      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (paymentsData) setPayments(paymentsData);

      const { data: ptData } = await supabase
        .from("pt_subscriptions")
        .select("*, personal_trainer:personal_trainers(id, name, specialization), time_slot:trainer_time_slots(id, start_time, end_time, trainer_id)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (ptData) {
        // Resolve correct time slot for each ACTIVE PT sub by matching slot's trainer to PT's current trainer.
        // This handles the case where a trainer was replaced but the time_slot_id still points to the old trainer's slot.
        const activePts = ptData.filter(pt => pt.status === "active");
        let slotLookup: Record<string, { id: string; start_time: string; end_time: string } | null> = {};

        if (activePts.length > 0) {
          // Get all time_slot_members for this member (one query)
          const { data: tsmData } = await supabase
            .from("time_slot_members" as any)
            .select("time_slot_id, time_slot:trainer_time_slots(id, start_time, end_time, trainer_id)")
            .eq("member_id", memberId);

          for (const pt of activePts) {
            if (!pt.personal_trainer) continue;

            // Resolve current PT trainer's staff_id (via phone) to compare against slot trainer_id
            const { data: ptTrainer } = await supabase
              .from("personal_trainers")
              .select("phone")
              .eq("id", (pt.personal_trainer as any).id)
              .maybeSingle();
            if (!ptTrainer?.phone) continue;
            const { data: staffRec } = await supabase
              .from("staff" as any)
              .select("id")
              .eq("phone", ptTrainer.phone)
              .maybeSingle();
            if (!staffRec) continue;
            const currentTrainerStaffId = (staffRec as any).id;

            // If existing slot already belongs to the current trainer, keep it as-is.
            const existingSlotTrainerId = (pt.time_slot as any)?.trainer_id;
            if (pt.time_slot_id && existingSlotTrainerId === currentTrainerStaffId) {
              continue;
            }

            // Otherwise, find a slot among the member's time_slot_members that belongs to the current trainer.
            const matchedSlot = (tsmData as any[] | null)?.find(
              (tsm: any) => tsm.time_slot?.trainer_id === currentTrainerStaffId
            );
            if (matchedSlot?.time_slot) {
              slotLookup[pt.id] = matchedSlot.time_slot;
            } else {
              // No slot matches the current trainer → clear stale slot reference
              slotLookup[pt.id] = null;
            }
          }
        }

        const enrichedPtData = ptData.map(pt => {
          if (Object.prototype.hasOwnProperty.call(slotLookup, pt.id)) {
            const resolved = slotLookup[pt.id];
            if (resolved) {
              return { ...pt, time_slot: resolved, time_slot_id: resolved.id };
            }
            return { ...pt, time_slot: null, time_slot_id: null };
          }
          return pt;
        });

        let finalPtData = enrichedPtData as any[];

        // If no PT subscriptions exist, check time_slot_members for slot-only assignments
        if (finalPtData.length === 0 && memberId) {
          const { data: tsmData } = await supabase
            .from("time_slot_members" as any)
            .select("time_slot_id, time_slot:trainer_time_slots(id, start_time, end_time, trainer_id, branch_id)")
            .eq("member_id", memberId);

          if (tsmData && (tsmData as any[]).length > 0) {
            for (const tsm of tsmData as any[]) {
              if (!tsm.time_slot) continue;
              // Resolve trainer from staff -> personal_trainers via phone
              const { data: staffRec } = await supabase
                .from("staff" as any)
                .select("phone")
                .eq("id", tsm.time_slot.trainer_id)
                .maybeSingle();
              if (!(staffRec as any)?.phone) continue;
              const { data: ptProfile } = await supabase
                .from("personal_trainers")
                .select("id, name, specialization, monthly_fee")
                .eq("phone", (staffRec as any).phone)
                .eq("branch_id", tsm.time_slot.branch_id || member?.branch_id || "")
                .eq("is_active", true)
                .maybeSingle();
              if (!ptProfile) continue;

              // Get member's subscription end date
              const activeSub = subscriptions.find(s => s.status === "active" || s.status === "expiring_soon");
              const today = new Date().toISOString().split("T")[0];
              const endDate = activeSub?.end_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

              finalPtData.push({
                id: `virtual-${tsm.time_slot_id}`,
                start_date: today,
                end_date: endDate,
                monthly_fee: ptProfile.monthly_fee,
                total_fee: ptProfile.monthly_fee,
                status: "active",
                personal_trainer: { id: ptProfile.id, name: ptProfile.name, specialization: ptProfile.specialization },
                time_slot: { id: tsm.time_slot.id, start_time: tsm.time_slot.start_time, end_time: tsm.time_slot.end_time },
                time_slot_id: tsm.time_slot.id,
                branch_id: tsm.time_slot.branch_id || member?.branch_id,
                _isVirtual: true,
              });
            }
          }
        }

        setPtSubscriptions(finalPtData as any);
        const today = new Date().toISOString().split("T")[0];
        const active = finalPtData.find((pt: any) => pt.end_date >= today && pt.status === "active");
        setActivePT((active as any) || null);
      }
    } catch (error) {
      console.error("Error fetching member data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-2 py-0.5">Active</Badge>;
      case "expiring_soon":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-2 py-0.5">Expiring Soon</Badge>;
      case "expired":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] px-2 py-0.5">Expired</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] px-2 py-0.5">{status}</Badge>;
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getPaymentTypeLabel = (type: string | null) => {
    switch (type) {
      case "gym_and_pt":
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/30 text-accent">Gym + PT</Badge>;
      case "pt_only":
      case "pt":
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">PT</Badge>;
      case "gym_membership":
      default:
        return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">Gym</Badge>;
    }
  };

  const formatPaymentNotes = (notes: string | null) => {
    if (!notes) return null;
    if (notes.startsWith("pt_subscription_id:")) return null;
    return notes;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const calculateAge = (dob: string | null | undefined): number | null => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  };

  // Latest gym subscription (used for expiry banner)
  const latestSubscription = subscriptions[0] || null;
  const expiryInfo = (() => {
    if (!latestSubscription) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(latestSubscription.end_date);
    end.setHours(0, 0, 0, 0);
    const diffMs = end.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { kind: "expired" as const, days: Math.abs(diffDays), endDate: latestSubscription.end_date };
    if (diffDays <= 7) return { kind: "expiring" as const, days: diffDays, endDate: latestSubscription.end_date };
    return null;
  })();

  const formatSlotTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  const handleNotifyWhatsApp = async (pt: PTSubscription) => {
    if (!member) return;
    setIsSendingWhatsApp(pt.id);
    try {
      const trainerName = pt.personal_trainer?.name || "your trainer";
      const slotInfo = pt.time_slot 
        ? `\nTime Slot: ${formatSlotTime(pt.time_slot.start_time)} – ${formatSlotTime(pt.time_slot.end_time)}`
        : "";
      const message = `Hi ${member.name}, your personal trainer *${trainerName}* has been assigned.${slotInfo}\nPeriod: ${formatDate(pt.start_date)} to ${formatDate(pt.end_date)}`;

      const { error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          memberIds: [member.id],
          type: "custom",
          customMessage: message,
          branchId: member.branch_id,
        },
      });

      if (error) throw error;
      toast.success("WhatsApp notification sent!");
    } catch (error: any) {
      console.error("WhatsApp error:", error);
      toast.error("Failed to send WhatsApp notification");
    } finally {
      setIsSendingWhatsApp(null);
    }
  };

  const handleOpenSlotAssign = async (pt: PTSubscription) => {
    if (!pt.personal_trainer) return;
    setAssigningSlotForPt(pt);
    setSelectedSlotId("");

    // trainer_time_slots.trainer_id references staff.id, not personal_trainers.id
    // Look up staff ID via personal_trainer's phone
    const { data: ptData } = await supabase
      .from("personal_trainers")
      .select("phone")
      .eq("id", pt.personal_trainer.id)
      .maybeSingle();

    if (!ptData?.phone) {
      setAvailableSlots([]);
      return;
    }

    const { data: staffData } = await supabase
      .from("staff")
      .select("id")
      .eq("phone", ptData.phone)
      .eq("role", "trainer")
      .eq("is_active", true)
      .maybeSingle();

    if (!staffData) {
      setAvailableSlots([]);
      return;
    }

    const { data: slots } = await supabase
      .from("trainer_time_slots")
      .select("id, start_time, end_time, capacity, status")
      .eq("trainer_id", staffData.id)
      .eq("branch_id", pt.branch_id || member?.branch_id || "");

    if (slots) {
      const slotsWithCounts = await Promise.all(
        slots.map(async (slot) => {
          const { count } = await supabase
            .from("time_slot_members")
            .select("*", { count: "exact", head: true })
            .eq("time_slot_id", slot.id);
          return { ...slot, current_count: count || 0 };
        })
      );
      setAvailableSlots(slotsWithCounts);
    } else {
      setAvailableSlots([]);
    }
  };

  const handleSaveSlotAssignment = async () => {
    if (!assigningSlotForPt || !selectedSlotId || !member) return;
    setIsSavingSlot(true);
    try {
      // Update pt_subscription with time_slot_id
      const { error: updateError } = await supabase
        .from("pt_subscriptions")
        .update({ time_slot_id: selectedSlotId })
        .eq("id", assigningSlotForPt.id);
      if (updateError) throw updateError;

      // Add to time_slot_members
      await supabase.from("time_slot_members").insert({
        time_slot_id: selectedSlotId,
        member_id: memberId!,
        branch_id: member.branch_id,
        assigned_by: "admin",
      });

      toast.success("Time slot assigned successfully!");
      setAssigningSlotForPt(null);
      fetchMemberData();
      invalidatePtSubscriptions();
    } catch (error: any) {
      console.error("Error assigning slot:", error);
      toast.error(error.message || "Failed to assign time slot");
    } finally {
      setIsSavingSlot(false);
    }
  };

  const totalPaid = payments
    .filter((p) => p.status === "success")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const renewalPrefill: RenewalExistingMember | null = member
    ? {
        id: member.id,
        name: member.name,
        phone: member.phone,
        subscription: latestSubscription
          ? {
              status: latestSubscription.status,
              end_date: latestSubscription.end_date,
            }
          : null,
        activePT: activePT?.personal_trainer
          ? {
              trainer_name: activePT.personal_trainer.name,
              end_date: activePT.end_date,
            }
          : null,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-2xl h-[80vh] sm:h-[75vh] overflow-hidden flex flex-col p-0 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] rounded-2xl border-border/60 shadow-2xl bg-background/95 backdrop-blur-xl">
        
        {/* Header with gradient accent */}
        <div className="relative px-5 pt-5 pb-3 sm:px-6 sm:pt-6 flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent rounded-t-2xl pointer-events-none" />
          <DialogHeader className="relative">
            <DialogTitle className="flex items-center gap-3 text-base md:text-lg">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 ring-1 ring-accent/20">
                <User className="w-4 h-4 text-accent" />
              </div>
              <div>
                <span className="block font-semibold tracking-tight">{memberName}</span>
                <DialogDescription className="text-[11px] md:text-xs mt-0.5 font-normal">
                  Member activity, subscriptions, and payment history
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
            </div>
            <p className="text-xs text-muted-foreground animate-pulse">Loading member data...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-5 sm:px-6 pb-5 sm:pb-6 min-h-0 overflow-hidden">
            <TabsList className="grid w-full grid-cols-5 h-10 flex-shrink-0 p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="overview" className="text-[10px] md:text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">Overview</TabsTrigger>
              <TabsTrigger value="subscriptions" className="text-[10px] md:text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">Gym</TabsTrigger>
              <TabsTrigger value="pt" className="text-[10px] md:text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">PT History</TabsTrigger>
              <TabsTrigger value="health" className="text-[10px] md:text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">Health</TabsTrigger>
              <TabsTrigger value="payments" className="text-[10px] md:text-sm rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all duration-200">Payments</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin" key="overview">
              <div className="space-y-3">
                {/* Expiry Notification Banner — eye-catching */}
                {expiryInfo && (
                  <div
                    className={cn(
                      "rounded-xl p-4 border-2 shadow-sm relative overflow-hidden",
                      expiryInfo.kind === "expired"
                        ? "bg-red-500/10 border-red-500/40 animate-pulse-slow"
                        : "bg-amber-500/10 border-amber-500/40"
                    )}
                    style={{ animation: "memberDialogFadeSlide 0.4s ease-out forwards" }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0",
                          expiryInfo.kind === "expired" ? "bg-red-500/20" : "bg-amber-500/20"
                        )}
                      >
                        {expiryInfo.kind === "expired" ? (
                          <XCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "text-sm font-bold uppercase tracking-wide",
                              expiryInfo.kind === "expired" ? "text-red-600" : "text-amber-700"
                            )}
                          >
                            {expiryInfo.kind === "expired" ? "Membership Expired" : "Expiring Soon"}
                          </span>
                          <Badge
                            className={cn(
                              "text-[10px] px-2 py-0.5",
                              expiryInfo.kind === "expired"
                                ? "bg-red-500 text-white border-red-600"
                                : "bg-amber-500 text-white border-amber-600"
                            )}
                          >
                            {expiryInfo.kind === "expired"
                              ? `${expiryInfo.days} day${expiryInfo.days !== 1 ? "s" : ""} ago`
                              : expiryInfo.days === 0
                              ? "Today"
                              : `In ${expiryInfo.days} day${expiryInfo.days !== 1 ? "s" : ""}`}
                          </Badge>
                        </div>
                        <p
                          className={cn(
                            "text-xs mt-1",
                            expiryInfo.kind === "expired" ? "text-red-600/80" : "text-amber-700/80"
                          )}
                        >
                          {expiryInfo.kind === "expired"
                            ? `Membership expired ${expiryInfo.days} day${expiryInfo.days !== 1 ? "s" : ""} ago on ${formatDate(expiryInfo.endDate)}.`
                            : expiryInfo.days === 0
                            ? `Membership expires today (${formatDate(expiryInfo.endDate)}).`
                            : `Membership expires in ${expiryInfo.days} day${expiryInfo.days !== 1 ? "s" : ""} on ${formatDate(expiryInfo.endDate)}.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Info */}
                <AnimatedItem index={0}>
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3 hover:border-border transition-colors duration-200">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Contact Information</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">+91 {member?.phone}</span>
                      </div>
                      {member?.email && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <span className="text-sm break-words">{member.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm">
                          <span className="text-muted-foreground">Joined </span>
                          <span className="font-medium">{member?.join_date ? formatDate(member.join_date) : "N/A"}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </AnimatedItem>

                {/* Personal Details */}
                <AnimatedItem index={1}>
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3 hover:border-border transition-colors duration-200">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Personal Details</h4>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm">
                          <span className="text-muted-foreground">Gender: </span>
                          <span className="font-medium capitalize">{details?.gender || "Not provided"}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm">
                          <span className="text-muted-foreground">Date of Birth: </span>
                          <span className="font-medium">
                            {details?.date_of_birth ? formatDate(details.date_of_birth) : "Not provided"}
                          </span>
                          {details?.date_of_birth && calculateAge(details.date_of_birth) !== null && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-accent/30 text-accent">
                              {calculateAge(details.date_of_birth)} yrs
                            </Badge>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm break-words">
                          <span className="text-muted-foreground">Address: </span>
                          <span className="font-medium">{details?.address || "Not provided"}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80">
                          <IdCard className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-sm break-words">
                          <span className="text-muted-foreground">Photo ID: </span>
                          {details?.photo_id_type ? (
                            <span className="font-medium capitalize">{details.photo_id_type}: {details.photo_id_number || "N/A"}</span>
                          ) : (
                            <span className="font-medium">Not provided</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </AnimatedItem>

                {/* PT Status */}
                <AnimatedItem index={2}>
                  <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3 hover:border-border transition-colors duration-200">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                      <Dumbbell className="w-3 h-3" />
                      Personal Training Status
                    </h4>
                    {activePT ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{activePT.personal_trainer?.name}</span>
                          <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 border-emerald-500/20">Active</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(activePT.start_date)} — {formatDate(activePT.end_date)}
                        </p>
                        {activePT.time_slot ? (
                          <div className="flex items-center gap-2 pt-1">
                            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-accent/10">
                              <Clock className="w-3 h-3 text-accent" />
                            </div>
                            <span className="text-sm">
                              <span className="text-muted-foreground">Time Slot: </span>
                              <span className="font-medium">
                                {formatSlotTime(activePT.time_slot.start_time)} – {formatSlotTime(activePT.time_slot.end_time)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted/60">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-xs text-muted-foreground italic">No time slot assigned</span>
                          </div>
                        )}
                        {activePT.personal_trainer?.specialization && (
                          <p className="text-xs text-muted-foreground/70">
                            Specialization: {activePT.personal_trainer.specialization}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-muted-foreground py-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60">
                          <UserX className="w-4 h-4" />
                        </div>
                        <span className="text-sm">No active personal training</span>
                      </div>
                    )}
                  </div>
                </AnimatedItem>

                {/* Summary Stats */}
                <AnimatedItem index={3}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-center hover:border-accent/30 transition-all duration-200 group">
                      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10 mx-auto mb-2 group-hover:scale-110 transition-transform duration-200">
                        <TrendingUp className="w-4 h-4 text-accent" />
                      </div>
                      <p className="text-xl font-bold text-accent">{subscriptions.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Gym Subscriptions</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4 text-center hover:border-emerald-500/30 transition-all duration-200 group">
                      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 mx-auto mb-2 group-hover:scale-110 transition-transform duration-200">
                        <Wallet className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-xl font-bold text-emerald-600 flex items-center justify-center gap-0.5">
                        <IndianRupee className="w-4 h-4" />
                        {totalPaid.toLocaleString("en-IN")}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Total Paid</p>
                    </div>
                  </div>
                </AnimatedItem>
              </div>
            </TabsContent>

            {/* Subscriptions Tab */}
            <TabsContent value="subscriptions" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1" key="subscriptions">
              <div className="space-y-2.5">
                {subscriptions.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/60 mx-auto mb-3">
                      <Calendar className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">No subscriptions found</p>
                  </div>
                ) : (
                  subscriptions.map((sub, i) => (
                    <AnimatedItem key={sub.id} index={i}>
                      <div className="rounded-xl border border-border/60 bg-card/50 p-3.5 md:p-4 hover:border-border transition-colors duration-200">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                {sub.is_custom_package 
                                  ? `${sub.custom_days} Day Pass` 
                                  : `${sub.plan_months} Month${sub.plan_months > 1 ? "s" : ""}`}
                              </span>
                              {getStatusBadge(sub.status)}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                              </p>
                              {sub.personal_trainer && (
                                <p className="flex items-center gap-2">
                                  <Dumbbell className="w-3.5 h-3.5" />
                                  Trainer: {sub.personal_trainer.name}
                                  {sub.trainer_fee && ` (₹${sub.trainer_fee})`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </AnimatedItem>
                  ))
                )}
              </div>
            </TabsContent>

            {/* PT History Tab */}
            <TabsContent value="pt" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1" key="pt">
              <div className="space-y-2.5">
                {/* Assign / Replace Trainer Button */}
                <div className="flex justify-end">
                  {activePT ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => { setAssignMode("replace"); setShowAssignTrainer(true); }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Replace Trainer
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => { setAssignMode("assign"); setShowAssignTrainer(true); }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Assign Trainer
                    </Button>
                  )}
                </div>

                {ptSubscriptions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/60 mx-auto mb-3">
                      <Dumbbell className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">No personal training history</p>
                  </div>
                ) : (
                  ptSubscriptions.map((pt, i) => (
                    <AnimatedItem key={pt.id} index={i}>
                      <div className="rounded-xl border border-border/60 bg-card/50 p-3.5 md:p-4 hover:border-border transition-colors duration-200">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Dumbbell className="w-4 h-4 text-amber-500" />
                              <span className="font-semibold text-sm">{pt.personal_trainer?.name || "Unknown Trainer"}</span>
                              {pt.status === "active" && new Date(pt.end_date) >= new Date() ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">Completed</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(pt.start_date)} — {formatDate(pt.end_date)}
                            </p>
                            {pt.time_slot && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {formatSlotTime(pt.time_slot.start_time)} – {formatSlotTime(pt.time_slot.end_time)}
                              </p>
                            )}
                            {pt.personal_trainer?.specialization && (
                              <p className="text-xs text-muted-foreground/70">
                                Specialization: {pt.personal_trainer.specialization}
                              </p>
                            )}
                          </div>
                          <div className="text-right space-y-1.5">
                            <p className="font-bold text-accent flex items-center justify-end gap-0.5 text-sm">
                              <IndianRupee className="w-3.5 h-3.5" />
                              {Number(pt.total_fee).toLocaleString("en-IN")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              ₹{Number(pt.monthly_fee).toLocaleString("en-IN")}/mo
                            </p>
                          </div>
                        </div>
                        {/* Action buttons for active PTs */}
                        {pt.status === "active" && new Date(pt.end_date) >= new Date() && (
                          <div className="mt-3 pt-2.5 border-t border-border/40 space-y-2">
                            {pt.time_slot ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-9 gap-1.5 rounded-xl border-primary/20 bg-card/80 text-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary hover:shadow-md"
                                onClick={() => setTransferringPt(pt)}
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />
                                Transfer Time Slot
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-1.5 text-xs h-8"
                                onClick={() => handleOpenSlotAssign(pt)}
                              >
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                Assign Time Slot
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </AnimatedItem>
                  ))
                )}
              </div>

              {/* Assign / Extend Trainer Dialog */}
              {member && (
                <AssignTrainerDialog
                  open={showAssignTrainer}
                  onOpenChange={setShowAssignTrainer}
                  memberId={memberId!}
                  memberName={member.name}
                  memberPhone={member.phone}
                  branchId={member.branch_id}
                  mode={assignMode}
                  existingPtId={activePT?.id}
                  existingTrainerId={activePT?.personal_trainer?.id}
                  existingTrainer={
                    assignMode === "extend" && activePT?.personal_trainer
                      ? {
                          id: activePT.personal_trainer.id,
                          name: activePT.personal_trainer.name,
                          monthly_fee: Number(activePT.monthly_fee) || 0,
                          specialization: activePT.personal_trainer.specialization,
                          phone: null,
                        }
                      : null
                  }
                  existingPtEndDate={assignMode === "extend" ? activePT?.end_date : undefined}
                  membershipEndDate={subscriptions.find(s => s.status === "active" || s.status === "expiring_soon")?.end_date}
                  onSuccess={() => { fetchMemberData(); invalidatePtSubscriptions(); }}
                />
              )}

              {/* Assign Time Slot Dialog */}
              {assigningSlotForPt && (
                <Dialog open={!!assigningSlotForPt} onOpenChange={(open) => !open && setAssigningSlotForPt(null)}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base">
                        <Clock className="w-4 h-4 text-accent" />
                        Assign Time Slot
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        Select a time slot for {assigningSlotForPt.personal_trainer?.name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 pt-2">
                      {availableSlots.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No time slots available for this trainer</p>
                      ) : (
                        <div className="space-y-2">
                          {availableSlots.map((slot) => {
                            const isFull = slot.current_count >= slot.capacity;
                            return (
                              <button
                                key={slot.id}
                                disabled={isFull}
                                onClick={() => setSelectedSlotId(slot.id)}
                                className={cn(
                                  "w-full flex items-center justify-between p-3 rounded-lg border text-sm transition-all",
                                  selectedSlotId === slot.id
                                    ? "border-accent bg-accent/5 ring-1 ring-accent/20"
                                    : "border-border/60 hover:border-border",
                                  isFull && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                  {formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}
                                </span>
                                <span className={cn("text-xs", isFull ? "text-destructive" : "text-muted-foreground")}>
                                  {slot.current_count}/{slot.capacity}{isFull ? " Full" : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setAssigningSlotForPt(null)}>
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          disabled={!selectedSlotId || isSavingSlot}
                          onClick={handleSaveSlotAssignment}
                        >
                          {isSavingSlot && <Spinner className="w-4 h-4 animate-spin mr-2" />}
                          Assign Slot
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {transferringPt && member && transferringPt.personal_trainer && transferringPt.time_slot && (
                <TransferSlotDialog
                  open={!!transferringPt}
                  onOpenChange={(open) => !open && setTransferringPt(null)}
                  currentSlotId={transferringPt.time_slot.id}
                  slotMemberRowId={null}
                  ptSubscriptionId={transferringPt.id}
                  memberId={member.id}
                  memberName={member.name}
                  currentPtTrainerId={transferringPt.personal_trainer.id}
                  currentPtTrainerName={transferringPt.personal_trainer.name}
                  branchId={member.branch_id}
                  onTransferred={() => {
                    setTransferringPt(null);
                    fetchMemberData();
                    invalidatePtSubscriptions();
                  }}
                />
              )}
            </TabsContent>

            {/* Health Tab */}
            <TabsContent value="health" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1" key="health">
              {member && (
                <MemberHealthTab memberId={memberId!} branchId={member.branch_id || ""} />
              )}
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1" key="payments">
              <div className="space-y-2.5">
                {payments.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/60 mx-auto mb-3">
                      <Wallet className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm text-muted-foreground">No payments found</p>
                  </div>
                ) : (
                  payments.map((payment, i) => (
                    <AnimatedItem key={payment.id} index={i}>
                      <div className="rounded-xl border border-border/60 bg-card/50 p-3.5 md:p-4 hover:border-border transition-colors duration-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-muted/80">
                              {payment.payment_mode === "cash" ? (
                                <Banknote className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <CreditCard className="w-4 h-4 text-accent" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-sm flex items-center gap-0.5">
                                  <IndianRupee className="w-3.5 h-3.5" />
                                  {Number(payment.amount).toLocaleString("en-IN")}
                                </p>
                                {getPaymentTypeLabel(payment.payment_type)}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {formatDate(payment.created_at)} • <span className="capitalize">{payment.payment_mode}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {getPaymentStatusIcon(payment.status)}
                            <span className="text-xs capitalize font-medium">{payment.status}</span>
                          </div>
                        </div>
                        {formatPaymentNotes(payment.notes) && (
                          <p className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-1.5">{formatPaymentNotes(payment.notes)}</p>
                        )}
                      </div>
                    </AnimatedItem>
                  ))
                )}
              </div>
            </TabsContent>

            {activeTab === "subscriptions" && member && (
              <div className="sticky bottom-0 z-20 -mx-5 mt-3 border-t border-border/60 bg-background/95 px-5 pb-1 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
                <Button
                  className="h-11 w-full gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowRenewMember(true);
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Renew Member
                </Button>
              </div>
            )}

            {activeTab === "pt" && member && activePT && (
              <div className="sticky bottom-0 z-20 -mx-5 mt-3 border-t border-border/60 bg-background/95 px-5 pb-1 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
                <Button
                  className="h-11 w-full gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20 transition-all duration-200 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    setAssignMode("extend");
                    setShowAssignTrainer(true);
                  }}
                >
                  <Dumbbell className="h-4 w-4" />
                  Extend PT
                </Button>
              </div>
            )}
          </Tabs>
        )}

        {member && renewalPrefill && (
          <AddMemberDialog
            open={showRenewMember}
            onOpenChange={setShowRenewMember}
            onSuccess={() => {
              setShowRenewMember(false);
              fetchMemberData();
              invalidatePtSubscriptions();
            }}
            initialExistingMember={renewalPrefill}
            initialAction="renew_gym"
          />
        )}

        <style>{`
          @keyframes memberDialogFadeSlide {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
};
