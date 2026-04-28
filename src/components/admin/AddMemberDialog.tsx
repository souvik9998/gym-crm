import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  User, 
  Phone, 
  Calendar, 
  MapPin, 
  IdCard,
  IndianRupee,
  Dumbbell,
  CalendarDays,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  RefreshCw,
  UserCheck,
  Loader2,
  Mail,
  Briefcase,
  Droplets,
  ShieldAlert,
  Heart,
  Upload,
  FileText,
  X,
  MessageCircle,
  Clock,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DobInput } from "@/components/ui/dob-input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import {
  addMemberSchema,
  validateField,
  validateForm,
  nameSchema,
  phoneSchema,
  getPhotoIdSchema,
  sanitize,
  type FieldErrors,
} from "@/lib/validation";
import { ValidatedInput, InlineError } from "@/components/ui/validated-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { format, addDays, isAfter, isBefore } from "date-fns";
import { addPackageMonths } from "@/lib/packageDuration";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getWhatsAppAutoSendPreference } from "@/utils/whatsappAutoSend";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useDebounce } from "@/hooks/useDebounce";
import CouponInput from "@/components/ui/coupon-input";
import { useCouponValidation } from "@/hooks/useCouponValidation";

interface MonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
  is_active: boolean;
}

interface PersonalTrainer {
  id: string;
  name: string;
  monthly_fee: number;
  specialization: string | null;
  phone: string | null;
}

interface TrainerTimeSlot {
  id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  current_count: number;
}

export interface ExistingMember {
  id: string;
  name: string;
  phone: string;
  subscription?: {
    status: string;
    end_date: string;
  } | null;
  activePT?: {
    trainer_name: string;
    end_date: string;
  } | null;
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialExistingMember?: ExistingMember | null;
  initialAction?: "renew_gym" | "add_pt" | "renew_gym_pt" | null;
}

interface FieldSetting {
  enabled: boolean;
  required: boolean;
  locked?: boolean;
}

interface RegistrationFieldSettings {
  gender?: FieldSetting;
  date_of_birth?: FieldSetting;
  email?: FieldSetting;
  blood_group?: FieldSetting;
  occupation?: FieldSetting;
  address?: FieldSetting;
  emergency_contact_1?: FieldSetting;
  emergency_contact_2?: FieldSetting;
  photo_id?: FieldSetting;
  identity_proof_upload?: FieldSetting;
  health_details?: FieldSetting;
  medical_records_upload?: FieldSetting;
}

interface UploadedDoc {
  name: string;
  url: string;
  size: number;
}

const parseDateOnly = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const formatDateOnly = (date: Date): string => format(date, "yyyy-MM-dd");

const STEPS = [
  { id: 1, title: "Contact", icon: Phone },
  { id: 2, title: "Personal", icon: IdCard },
  { id: 3, title: "Package", icon: Calendar },
] as const;

export const AddMemberDialog = ({
  open,
  onOpenChange,
  onSuccess,
  initialExistingMember = null,
  initialAction = null,
}: AddMemberDialogProps) => {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  
  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  // Payment mode
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi">("cash");

  // Free registration toggle — when ON, no payment is recorded and all fees become 0.
  // Manual fee inputs are disabled while this is on; coupon section is hidden.
  const [registerFree, setRegisterFree] = useState(false);
  
  // Existing member check
  const [existingMember, setExistingMember] = useState<ExistingMember | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  const [selectedAction, setSelectedAction] = useState<"new" | "renew_gym" | "add_pt" | "renew_gym_pt" | null>(null);
  const debouncedPhone = useDebounce(phone, 400);
  
  // Personal details
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [occupation, setOccupation] = useState("");
  
  // Health details (optional, mirrors public registration)
  const [bloodGroup, setBloodGroup] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyContact1Name, setEmergencyContact1Name] = useState("");
  const [emergencyContact1Phone, setEmergencyContact1Phone] = useState("");
  const [emergencyContact2Name, setEmergencyContact2Name] = useState("");
  const [emergencyContact2Phone, setEmergencyContact2Phone] = useState("");
  const [identityFiles, setIdentityFiles] = useState<UploadedDoc[]>([]);
  const [medicalFiles, setMedicalFiles] = useState<UploadedDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Field settings - mirrors public registration portal
  const [fieldSettings, setFieldSettings] = useState<RegistrationFieldSettings | null>(null);
  
  // Notify member via WhatsApp on submit
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  
  // Package selection
  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  
  // Editable fees
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [joiningFee, setJoiningFee] = useState(0);
  
  // Personal Training
  const [wantsPT, setWantsPT] = useState(false);
  const [trainers, setTrainers] = useState<PersonalTrainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [ptMonths, setPtMonths] = useState(1);
  const [ptFee, setPtFee] = useState(0);

  // Optional time slot for the selected trainer (mirrors AssignTrainerDialog).
  // Slot selection is OPTIONAL — leaving it unset still creates the PT subscription
  // but the member is not bound to a specific slot.
  const [trainerTimeSlots, setTrainerTimeSlots] = useState<TrainerTimeSlot[]>([]);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState("");
  const [isFetchingTimeSlots, setIsFetchingTimeSlots] = useState(false);
  
  // Start date selection
  const [startDate, setStartDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left");
  
  // GST settings
  const [taxRate, setTaxRate] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);

  // Check for existing member when phone changes
  useEffect(() => {
    if (debouncedPhone.length === 10 && currentBranch?.id) {
      checkExistingMember(debouncedPhone);
    } else {
      setExistingMember(null);
      setSelectedAction(null);
    }
  }, [debouncedPhone, currentBranch?.id]);

  const checkExistingMember = async (phoneNum: string) => {
    if (!currentBranch?.id) return;
    setIsCheckingPhone(true);
    try {
      // Use secure RPC (bypasses RLS issues, validates input)
      const { data: rpcData, error: rpcError } = await supabase.rpc("check_phone_exists", {
        phone_number: phoneNum,
        p_branch_id: currentBranch.id,
      });

      if (rpcError) throw rpcError;

      const rpcResult = rpcData?.[0];
      const member = rpcResult?.member_exists
        ? { id: rpcResult.member_id, name: rpcResult.member_name, phone: phoneNum }
        : null;

      if (member) {
        // Fetch latest subscription
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("status, end_date")
          .eq("member_id", member.id)
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fetch active PT
        const { data: pt } = await supabase
          .from("pt_subscriptions")
          .select("end_date, personal_trainers(name)")
          .eq("member_id", member.id)
          .eq("status", "active")
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        setExistingMember({
          id: member.id,
          name: member.name,
          phone: member.phone,
          subscription: sub ? { status: sub.status || "expired", end_date: sub.end_date } : null,
          activePT: pt ? { 
            trainer_name: (pt.personal_trainers as any)?.name || "Trainer", 
            end_date: pt.end_date 
          } : null,
        });
        setName(member.name);
      } else {
        setExistingMember(null);
        setSelectedAction(null);
      }
    } catch (err) {
      console.error("Phone check error:", err);
    } finally {
      setIsCheckingPhone(false);
    }
  };

  useEffect(() => {
    if (open && currentBranch) {
      fetchPackages();
      fetchTrainers();
      fetchTaxSettings();
      fetchFieldSettings();
      setCurrentStep(1);
    }
  }, [open, currentBranch]);

  useEffect(() => {
    if (!open) return;
    if (!initialExistingMember || !initialAction) return;

    setPhone(initialExistingMember.phone);
    setName(initialExistingMember.name);
    setExistingMember(initialExistingMember);
    setSelectedAction(initialAction);
    setWantsPT(initialAction === "add_pt" || initialAction === "renew_gym_pt");
    setSlideDirection("left");
    setCurrentStep(3);
  }, [open, initialExistingMember, initialAction]);

  const fetchFieldSettings = async () => {
    if (!currentBranch) return;
    const { data } = await supabase
      .from("gym_settings")
      .select("registration_field_settings")
      .eq("branch_id", currentBranch.id)
      .maybeSingle();
    if (data?.registration_field_settings) {
      const parsed = typeof data.registration_field_settings === "string"
        ? JSON.parse(data.registration_field_settings)
        : data.registration_field_settings;
      setFieldSettings(parsed as RegistrationFieldSettings);
    } else {
      setFieldSettings({});
    }
  };

  const fetchTaxSettings = async () => {
    if (!currentBranch) return;
    const { data } = await supabase
      .from("gym_settings")
      .select("invoice_tax_rate, invoice_show_gst")
      .eq("branch_id", currentBranch.id)
      .maybeSingle();
    if (data) {
      const rate = data.invoice_tax_rate || 0;
      const enabled = data.invoice_show_gst === true && rate > 0;
      setTaxRate(rate);
      setTaxEnabled(enabled);
    } else {
      setTaxRate(0);
      setTaxEnabled(false);
    }
  };

  const fetchPackages = async () => {
    if (!currentBranch) return;
    const { data } = await supabase
      .from("monthly_packages")
      .select("*")
      .eq("is_active", true)
      .eq("branch_id", currentBranch.id)
      .order("months");
    if (data && data.length > 0) {
      setMonthlyPackages(data);
      setSelectedPackageId(data[0].id);
      setMonthlyFee(Number(data[0].price));
      // Joining fee only applies to NEW members. Renewals (existing members)
      // should never be charged a joining fee — it's a one-time onboarding cost.
      setJoiningFee(isExistingMemberAction ? 0 : Number(data[0].joining_fee));
    } else {
      setMonthlyPackages([]);
      setSelectedPackageId("");
      setMonthlyFee(0);
      setJoiningFee(0);
    }
  };

  const fetchTrainers = async () => {
    if (!currentBranch) return;
    const { data } = await supabase
      .from("personal_trainers")
      .select("*")
      .eq("is_active", true)
      .eq("branch_id", currentBranch.id)
      .order("name");
    if (data && data.length > 0) {
      setTrainers(data as PersonalTrainer[]);
      setSelectedTrainerId(data[0].id);
      setPtFee(Number(data[0].monthly_fee));
      // Pre-fetch slots for the default-selected trainer so the dropdown is
      // populated as soon as the PT section is opened.
      fetchTrainerTimeSlots(data[0] as PersonalTrainer);
    } else {
      setTrainers([]);
      setSelectedTrainerId("");
      setPtFee(0);
      setTrainerTimeSlots([]);
      setSelectedTimeSlotId("");
    }
  };

  // Resolve trainer → staff (via shared phone) → trainer_time_slots, mirroring
  // the AssignTrainerDialog pattern. Returns slots with current member counts.
  const fetchTrainerTimeSlots = async (trainer: PersonalTrainer) => {
    if (!currentBranch?.id) return;
    setIsFetchingTimeSlots(true);
    setTrainerTimeSlots([]);
    setSelectedTimeSlotId("");
    if (!trainer.phone) {
      setIsFetchingTimeSlots(false);
      return;
    }
    try {
      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("phone", trainer.phone)
        .eq("role", "trainer")
        .eq("is_active", true)
        .maybeSingle();

      if (!staffData) {
        setIsFetchingTimeSlots(false);
        return;
      }

      const { data: slots } = await supabase
        .from("trainer_time_slots")
        .select("id, start_time, end_time, capacity")
        .eq("trainer_id", staffData.id)
        .eq("branch_id", currentBranch.id);

      if (slots && slots.length > 0) {
        const slotsWithCounts: TrainerTimeSlot[] = await Promise.all(
          slots.map(async (slot: any) => {
            const { count } = await supabase
              .from("time_slot_members")
              .select("*", { count: "exact", head: true })
              .eq("time_slot_id", slot.id);
            return { ...slot, current_count: count || 0 };
          }),
        );
        setTrainerTimeSlots(slotsWithCounts);
      }
    } catch (e) {
      console.error("fetchTrainerTimeSlots failed:", e);
    } finally {
      setIsFetchingTimeSlots(false);
    }
  };

  const formatSlotTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  /**
   * After a pt_subscriptions row is created, optionally bind the member to
   * the chosen trainer time slot. No-op when slot selection is empty.
   * Uses delete+insert (instead of upsert) to mirror AssignTrainerDialog and
   * avoid duplicate (slot, member) rows protected by the unique constraint.
   */
  const bindMemberToTimeSlot = async (
    ptSubscriptionId: string | undefined,
    memberId: string,
  ) => {
    if (!selectedTimeSlotId || !currentBranch?.id) return;
    try {
      // Stamp the pt_subscriptions row with the chosen slot so analytics /
      // slot-attendance views can correctly attribute this member.
      if (ptSubscriptionId) {
        await supabase
          .from("pt_subscriptions")
          .update({ time_slot_id: selectedTimeSlotId } as any)
          .eq("id", ptSubscriptionId);
      }

      await supabase
        .from("time_slot_members")
        .delete()
        .eq("member_id", memberId)
        .eq("time_slot_id", selectedTimeSlotId);

      await supabase.from("time_slot_members").insert({
        time_slot_id: selectedTimeSlotId,
        member_id: memberId,
        branch_id: currentBranch.id,
        assigned_by: "admin",
      });
    } catch (e) {
      console.error("Time slot binding failed (non-fatal):", e);
    }
  };

  const handlePackageChange = (packageId: string) => {
    setSelectedPackageId(packageId);
    const pkg = monthlyPackages.find((p) => p.id === packageId);
    if (pkg) {
      setMonthlyFee(Number(pkg.price));
      // Suppress joining fee on renewals — it's a one-time onboarding charge
      // applied only when registering a brand-new member.
      setJoiningFee(isExistingMemberAction ? 0 : Number(pkg.joining_fee));
      if (ptMonths > pkg.months) setPtMonths(pkg.months);
    }
  };

  const handleTrainerChange = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) {
      setPtFee(Number(trainer.monthly_fee) * ptMonths);
      fetchTrainerTimeSlots(trainer);
    }
  };

  const handlePtMonthsChange = (months: number) => {
    setPtMonths(months);
    const trainer = trainers.find((t) => t.id === selectedTrainerId);
    if (trainer) setPtFee(Number(trainer.monthly_fee) * months);
  };

  const selectedPackage = monthlyPackages.find((p) => p.id === selectedPackageId);
  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);

  // For existing member actions, determine what to show
  const isExistingMemberAction = !!selectedAction && selectedAction !== "new";
  const showGymSection = !selectedAction || selectedAction === "new" || selectedAction === "renew_gym" || selectedAction === "renew_gym_pt";
  const showPTSection = !selectedAction || selectedAction === "new" || selectedAction === "add_pt" || selectedAction === "renew_gym_pt";
  const isPTOnly = selectedAction === "add_pt";

  // Joining fee is a one-time charge applied only to BRAND-NEW members.
  // Force it to 0 whenever the flow is any kind of existing-member action
  // (renew gym, add PT, renew gym + PT). When the user toggles back to
  // "new" we restore the package's configured joining fee.
  useEffect(() => {
    if (isExistingMemberAction) {
      if (joiningFee !== 0) setJoiningFee(0);
    } else if (selectedAction === "new") {
      const pkg = monthlyPackages.find((p) => p.id === selectedPackageId);
      if (pkg) setJoiningFee(Number(pkg.joining_fee));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAction, selectedPackageId, monthlyPackages]);

  // When the admin turns OFF the PT toggle, drop any selected slot so it
  // doesn't get silently saved if they toggle it back on with a different intent.
  useEffect(() => {
    if (!wantsPT && !isPTOnly) {
      setSelectedTimeSlotId("");
    }
  }, [wantsPT, isPTOnly]);

  const gymTotal = showGymSection ? monthlyFee + joiningFee : 0;
  const ptTotal = (wantsPT || isPTOnly) ? ptFee : 0;
  const subtotalAmount = gymTotal + ptTotal;
  const taxAmount = taxEnabled && taxRate > 0 ? Math.round((subtotalAmount * taxRate) / 100) : 0;

  // Coupon validation — works for new members and existing-member actions.
  // Disabled entirely when registering free (no payment, no discount math needed).
  const adminCoupon = useCouponValidation({
    branchId: currentBranch?.id,
    isNewMember: !isExistingMemberAction,
    memberId: existingMember?.id,
    subtotal: subtotalAmount + taxAmount,
    context: isExistingMemberAction ? "renewal" : "new_registration",
  });
  const couponDiscount = registerFree ? 0 : (adminCoupon.appliedCoupon?.discountAmount || 0);
  // When registering free, force the total to 0 regardless of fee inputs.
  const totalAmount = registerFree ? 0 : Math.max(0, subtotalAmount + taxAmount - couponDiscount);

  // Helper: clamp manual fee inputs to a minimum of 1 (never 0) when not registering free.
  // Allows empty string while typing, but the bound value is at least 1 once a number is entered.
  const handleFeeInput = (raw: string, setter: (n: number) => void) => {
    if (raw === "") { setter(0); return; }
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    setter(n < 1 ? 1 : n);
  };

  // Calculate the gym membership end date for PT capping
  const gymMembershipEndDate = (() => {
    if (isPTOnly && existingMember?.subscription?.end_date) {
      // For PT-only on existing member, cap to their gym membership end date
      return parseDateOnly(existingMember.subscription.end_date);
    }
    if (selectedAction === "renew_gym_pt" && selectedPackage) {
      // For renew + PT, cap to the new gym end date
      const gymStart = new Date(startDate);
      gymStart.setHours(0, 0, 0, 0);
      return addPackageMonths(gymStart, selectedPackage.months);
    }
    if (selectedPackage) {
      // For new members, cap to the selected package end date
      const gymStart = new Date(startDate);
      gymStart.setHours(0, 0, 0, 0);
      return addPackageMonths(gymStart, selectedPackage.months);
    }
    return null;
  })();

  const minAllowedStartDate = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if ((selectedAction === "renew_gym" || selectedAction === "renew_gym_pt") && existingMember?.subscription?.end_date) {
      const subscriptionEnd = parseDateOnly(existingMember.subscription.end_date);
      if (subscriptionEnd) {
        return addDays(subscriptionEnd, 1);
      }
    }

    return today;
  })();

  useEffect(() => {
    if (!open) return;
    if (startDate < minAllowedStartDate) {
      setStartDate(minAllowedStartDate);
    }
  }, [open, minAllowedStartDate, startDate]);

  const ptMonthOptions: number[] = [];
  if (gymMembershipEndDate) {
    const ptStart = new Date(startDate);
    ptStart.setHours(0, 0, 0, 0);
    for (let m = 1; m <= 12; m++) {
      const ptEnd = addPackageMonths(ptStart, m);
      if (isAfter(ptEnd, gymMembershipEndDate)) break;
      ptMonthOptions.push(m);
    }
    // Ensure at least showing that no months are available
    if (ptMonthOptions.length === 0 && isPTOnly) {
      // No valid PT months - membership too short
    }
  } else {
    for (let i = 1; i <= (selectedPackage?.months || 1); i++) {
      ptMonthOptions.push(i);
    }
  }

  // Reset ptMonths if current selection exceeds available options
  useEffect(() => {
    if (ptMonthOptions.length > 0 && !ptMonthOptions.includes(ptMonths)) {
      const maxAvailable = ptMonthOptions[ptMonthOptions.length - 1];
      setPtMonths(maxAvailable);
      const trainer = trainers.find((t) => t.id === selectedTrainerId);
      if (trainer) setPtFee(Number(trainer.monthly_fee) * maxAvailable);
    }
  }, [ptMonthOptions, ptMonths]);

  const formatIdNumber = (value: string, type: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (type === "aadhaar") {
      return cleaned.replace(/(.{4})/g, "$1 ").trim().slice(0, 14);
    }
    return cleaned;
  };

  // File upload handler (mirrors public registration)
  const handleFileUpload = async (file: File, type: "identity" | "medical") => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum file size is 5MB" });
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type", { description: "Only JPG, PNG, WebP, and PDF are allowed" });
      return;
    }
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${type}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("member-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("member-documents").getPublicUrl(path);
      const uploaded: UploadedDoc = { name: file.name, url: publicUrl, size: file.size };
      if (type === "identity") setIdentityFiles((p) => [...p, uploaded]);
      else setMedicalFiles((p) => [...p, uploaded]);
      toast.success("File uploaded");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  // Helpers to read settings (defaults match public registration behavior)
  const fs = fieldSettings || {};
  const showGender = fs.gender?.enabled !== false; // locked, default true
  const showDOB = fs.date_of_birth?.enabled !== false;
  const dobRequired = fs.date_of_birth?.required ?? true;
  const showAddress = fs.address?.enabled !== false;
  const addressRequired = fs.address?.required ?? false;
  const showPhotoId = fs.photo_id?.enabled !== false;
  const photoIdRequired = fs.photo_id?.required ?? false;
  const showEmail = fs.email?.enabled === true;
  const emailRequired = fs.email?.required === true;
  const showOccupation = fs.occupation?.enabled === true;
  const occupationRequired = fs.occupation?.required === true;
  const showBloodGroup = fs.blood_group?.enabled === true;
  const bloodGroupRequired = fs.blood_group?.required === true;
  const showHealth = fs.health_details?.enabled === true;
  const healthRequired = fs.health_details?.required === true;
  const showEC1 = fs.emergency_contact_1?.enabled === true;
  const ec1Required = fs.emergency_contact_1?.required === true;
  const showEC2 = fs.emergency_contact_2?.enabled === true;
  const ec2Required = fs.emergency_contact_2?.required === true;
  const showIdentityUpload = fs.identity_proof_upload?.enabled === true;
  const identityRequired = fs.identity_proof_upload?.required === true;
  const showMedicalUpload = fs.medical_records_upload?.enabled === true;
  const medicalRequired = fs.medical_records_upload?.required === true;

  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Step validation - Step 1 only has phone
  const isPhoneSettled = phone.length === 10 && debouncedPhone === phone && !isCheckingPhone;
  const isStep1Valid = isPhoneSettled && !existingMember;

  // Step 2 - dynamic based on field settings (mirrors public registration)
  const isStep2Valid = (() => {
    if (name.trim().length < 2) return false;
    if (showGender && !gender) return false;
    if (showDOB && dobRequired && !dateOfBirth) return false;
    if (showPhotoId && photoIdRequired && (!photoIdType || !photoIdNumber.trim())) return false;
    if (showPhotoId && photoIdType && !photoIdNumber.trim()) return false; // if type chosen, number required
    if (showAddress && addressRequired && address.trim().length < 3) return false;
    if (showEmail && emailRequired && !email) return false;
    if (showEmail && !emailValid) return false;
    if (showOccupation && occupationRequired && !occupation.trim()) return false;
    if (showBloodGroup && bloodGroupRequired && !bloodGroup) return false;
    if (showHealth && healthRequired && (!bloodGroup || !emergencyContact1Name || !emergencyContact1Phone)) return false;
    if (showEC1 && ec1Required && (!emergencyContact1Name || !emergencyContact1Phone)) return false;
    if (showEC2 && ec2Required && (!emergencyContact2Name || !emergencyContact2Phone)) return false;
    if (showIdentityUpload && identityRequired && identityFiles.length === 0) return false;
    if (showMedicalUpload && medicalRequired && medicalFiles.length === 0) return false;
    return true;
  })();

  const isStep3Valid = isPTOnly ? (!!selectedTrainerId && ptMonthOptions.length > 0) : !!selectedPackageId;


  const goToStep = (step: number) => {
    if (step > currentStep) {
      // Validate current step before advancing
      if (currentStep === 1) {
        if (!isStep1Valid) {
          if (existingMember) {
            toast.error("Member Already Exists", {
              description: "Please use one of the options below to renew or add PT",
            });
          } else if (isCheckingPhone) {
            toast.info("Checking phone number...", { description: "Please wait" });
          } else if (phone.length < 10) {
            toast.error("Enter a valid 10-digit phone number");
          }
          return;
        }
      }
      if (currentStep === 2 && !isStep2Valid) {
        const missing: string[] = [];
        if (name.trim().length < 2) missing.push("Full Name");
        if (showGender && !gender) missing.push("Gender");
        if (showDOB && dobRequired && !dateOfBirth) missing.push("Date of Birth");
        if (showPhotoId && photoIdRequired && !photoIdType) missing.push("Photo ID Type");
        if (showPhotoId && photoIdType && !photoIdNumber.trim()) missing.push("Photo ID Number");
        if (showAddress && addressRequired && address.trim().length < 3) missing.push("Address");
        if (showEmail && emailRequired && !email) missing.push("Email");
        if (showEmail && email && !emailValid) missing.push("Valid Email");
        if (showOccupation && occupationRequired && !occupation.trim()) missing.push("Occupation");
        if (showBloodGroup && bloodGroupRequired && !bloodGroup) missing.push("Blood Group");
        if (showEC1 && ec1Required && (!emergencyContact1Name || !emergencyContact1Phone)) missing.push("Emergency Contact 1");
        if (showEC2 && ec2Required && (!emergencyContact2Name || !emergencyContact2Phone)) missing.push("Emergency Contact 2");
        if (showIdentityUpload && identityRequired && identityFiles.length === 0) missing.push("Identity Proof Upload");
        if (showMedicalUpload && medicalRequired && medicalFiles.length === 0) missing.push("Medical Records Upload");
        toast.error("Please fill all required fields", {
          description: missing.join(", "),
        });
        return;
      }
      setSlideDirection("left");
    } else {
      setSlideDirection("right");
    }
    setCurrentStep(step);
  };

  const handleSubmit = async () => {

    const sanitizedName = sanitize(name);
    const result = validateForm(addMemberSchema, { name: sanitizedName, phone });
    if (!result.success) {
      setFieldErrors(result.errors);
      setTouched({ name: true, phone: true });
      toast.error("Invalid Input", {
        description: Object.values(result.errors).filter(Boolean)[0] || "Please check all fields",
      });
      setCurrentStep(1);
      return;
    }

    if (photoIdType && photoIdNumber) {
      const idError = validateField(getPhotoIdSchema(photoIdType), photoIdNumber);
      if (idError) {
        setFieldErrors((prev) => ({ ...prev, photoIdNumber: idError }));
        setTouched((prev) => ({ ...prev, photoIdNumber: true }));
        toast.error("Invalid ID Number", { description: idError });
        setCurrentStep(2);
        return;
      }
    }

    if (!selectedPackageId) {
      toast.error("Please select a package");
      return;
    }

    setIsLoading(true);

    try {
      // Final safety net: re-check phone right before insert (prevents race conditions
      // and catches cases where the debounced check missed an existing member)
      if (currentBranch?.id) {
        const { data: rpcData } = await supabase.rpc("check_phone_exists", {
          phone_number: phone,
          p_branch_id: currentBranch.id,
        });
        const existing = rpcData?.[0];
        if (existing?.member_exists) {
          setIsLoading(false);
          // Trigger the existing-member UI flow instead of inserting
          setExistingMember({
            id: existing.member_id,
            name: existing.member_name,
            phone,
            subscription: null,
            activePT: null,
          });
          setName(existing.member_name);
          setCurrentStep(1);
          // Re-fetch full subscription details for the action picker
          await checkExistingMember(phone);
          toast.error("Member Already Exists", {
            description: `${existing.member_name} is already registered with this phone. Choose Renew or Add PT instead.`,
          });
          return;
        }
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name, phone, email: email || null, branch_id: currentBranch?.id || "" })
        .select()
        .single();
      if (memberError) {
        // Friendly handling for unique constraint violation (race condition fallback)
        if (
          memberError.code === "23505" ||
          /members_phone_branch_unique|duplicate key/i.test(memberError.message || "")
        ) {
          toast.error("Member Already Exists", {
            description: "A member with this phone number already exists in this branch. Use Renew or Add PT instead.",
          });
          setCurrentStep(1);
          if (currentBranch?.id) await checkExistingMember(phone);
          return;
        }
        throw memberError;
      }

      const hasDetails = gender || address || photoIdType || photoIdNumber || dateOfBirth ||
        bloodGroup || heightCm || weightKg || medicalConditions || allergies ||
        emergencyContact1Name || emergencyContact1Phone || wantsPT;
      if (hasDetails) {
        const { error: detailsError } = await supabase.from("member_details").insert({
          member_id: member.id,
          gender: gender || null,
          address: address || null,
          photo_id_type: photoIdType || null,
          photo_id_number: photoIdNumber || null,
          date_of_birth: dateOfBirth || null,
          personal_trainer_id: wantsPT ? selectedTrainerId : null,
          blood_group: bloodGroup || null,
          height_cm: heightCm ? Number(heightCm) : null,
          weight_kg: weightKg ? Number(weightKg) : null,
          medical_conditions: medicalConditions || null,
          allergies: allergies || null,
          emergency_contact_name: emergencyContact1Name || null,
          emergency_contact_phone: emergencyContact1Phone || null,
        });
        if (detailsError) throw detailsError;
      }

      // Save uploaded documents (mirrors public registration flow)
      const docsToInsert = [
        ...identityFiles.map((f) => ({ ...f, type: "identity_proof" })),
        ...medicalFiles.map((f) => ({ ...f, type: "medical_record" })),
      ];
      if (docsToInsert.length > 0) {
        await supabase.from("member_documents").insert(
          docsToInsert.map((d) => ({
            member_id: member.id,
            document_type: d.type,
            file_url: d.url,
            file_name: d.name,
            file_size: d.size,
            uploaded_by: "admin",
          }))
        );
      }

      const gymStartDate = new Date(startDate);
      gymStartDate.setHours(0, 0, 0, 0);
      const endDate = addPackageMonths(gymStartDate, selectedPackage?.months || 1);

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: formatDateOnly(gymStartDate),
          end_date: formatDateOnly(endDate),
          plan_months: selectedPackage?.months || 1,
          status: "active",
          personal_trainer_id: wantsPT ? selectedTrainerId : null,
          trainer_fee: wantsPT ? ptFee : null,
          branch_id: currentBranch?.id,
        })
        .select()
        .single();
      if (subError) throw subError;

      if (wantsPT && selectedTrainerId) {
        const ptEndDate = addPackageMonths(gymStartDate, ptMonths);
        const { data: insertedPt } = await supabase.from("pt_subscriptions").insert({
          member_id: member.id,
          personal_trainer_id: selectedTrainerId,
          start_date: formatDateOnly(gymStartDate),
          end_date: formatDateOnly(ptEndDate),
          monthly_fee: selectedTrainer?.monthly_fee || 0,
          total_fee: ptFee,
          status: "active",
          branch_id: currentBranch?.id,
        }).select("id").maybeSingle();
        await bindMemberToTimeSlot(insertedPt?.id, member.id);
      }

      const paymentType = wantsPT ? "gym_and_pt" : "gym_membership";
      const couponNote = adminCoupon.appliedCoupon
        ? ` (Coupon: ${adminCoupon.appliedCoupon.coupon.code}, -₹${couponDiscount})`
        : "";

      // Only create a payment record when there's an actual amount.
      // DB constraint: payments_amount_check (amount > 0).
      // For "Register Free", skip the payments row entirely — the subscription itself
      // marks them as a member; the activity log records that it was a free registration.
      let paymentRecord: { id: string } | null = null;
      if (!registerFree && totalAmount > 0) {
        const { data, error: paymentError } = await supabase.from("payments").insert({
          member_id: member.id,
          subscription_id: subscription.id,
          amount: totalAmount,
          payment_mode: paymentMode,
          status: "success",
          payment_type: paymentType,
          notes: `Added via admin dashboard (${paymentMode.toUpperCase()})${couponNote}`,
          branch_id: currentBranch?.id,
        }).select().single();
        if (paymentError) throw paymentError;
        paymentRecord = data;
      }

      // Record coupon usage if applied (works even when total is ₹0)
      if (adminCoupon.appliedCoupon) {
        await supabase.from("coupon_usage").insert({
          coupon_id: adminCoupon.appliedCoupon.coupon.id,
          member_id: member.id,
          payment_id: paymentRecord?.id ?? null,
          discount_applied: couponDiscount,
          branch_id: currentBranch?.id,
        });
        await supabase.from("coupons").update({
          usage_count: adminCoupon.appliedCoupon.coupon.usage_count + 1,
        }).eq("id", adminCoupon.appliedCoupon.coupon.id);
      }

      if (monthlyFee > 0) {
        await createMembershipIncomeEntry(
          monthlyFee, "gym_membership",
          `New member - ${name} (${selectedPackage?.months || 1} months)`,
          member.id, undefined, paymentRecord?.id, currentBranch?.id
        );
      }

      if (joiningFee > 0) {
        await createMembershipIncomeEntry(
          joiningFee, "joining_fee", `Joining fee - ${name}`,
          member.id, undefined, paymentRecord?.id, currentBranch?.id
        );
      }

      if (wantsPT && ptFee > 0 && selectedTrainer) {
        await createMembershipIncomeEntry(
          ptFee, "pt_subscription",
          `PT subscription - ${name} with ${selectedTrainer.name}`,
          member.id, undefined, paymentRecord?.id, currentBranch?.id
        );
        await calculateTrainerPercentageExpense(
          selectedTrainerId, ptFee, member.id, undefined, undefined, name, currentBranch?.id
        );
      }

      const paymentTag = registerFree ? "FREE" : paymentMode.toUpperCase();
      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members", type: "member_added",
          description: registerFree
            ? `Staff "${staffUser.fullName}" registered new member "${name}" FREE (${selectedPackage?.months || 1} month package, no payment collected)`
            : `Staff "${staffUser.fullName}" added new member "${name}" with ${selectedPackage?.months || 1} month package (${paymentTag})`,
          entityType: "members", entityId: member.id, entityName: name,
          newValue: { name, phone, package_months: selectedPackage?.months, total_amount: totalAmount, with_pt: wantsPT, payment_mode: registerFree ? "free" : paymentMode, registered_free: registerFree },
          branchId: currentBranch?.id, staffId: staffUser.id, staffName: staffUser.fullName,
          staffPhone: staffUser.phone, metadata: { staff_role: staffUser.role, registered_free: registerFree },
        });
      } else {
        await logAdminActivity({
          category: "members", type: "member_added",
          description: registerFree
            ? `Registered new member "${name}" FREE (${selectedPackage?.months || 1} month package, no payment collected)`
            : `Added new member "${name}" with ${selectedPackage?.months || 1} month package (${paymentTag})`,
          entityType: "members", entityId: member.id, entityName: name,
          newValue: { name, phone, package_months: selectedPackage?.months, total_amount: totalAmount, with_pt: wantsPT, payment_mode: registerFree ? "free" : paymentMode, registered_free: registerFree },
          branchId: currentBranch?.id,
          metadata: { registered_free: registerFree },
        });
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const adminUserId = session?.user?.id || null;
        
        // Send welcome/registration message — gated by the dialog checkbox
        // (overrides the admin_add_member auto-send pref so admin can opt-out per member)
        if (notifyWhatsApp) {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone, name, endDate: endDate.toISOString().split("T")[0], type: "new_registration",
              memberIds: [member.id], isManual: true, adminUserId,
              branchId: currentBranch?.id, branchName: currentBranch?.name,
            },
          });
        }
        
        // Send payment receipt if payment_details is enabled
        const shouldSendReceipt = await getWhatsAppAutoSendPreference(currentBranch?.id, "payment_details");
        if (shouldSendReceipt) {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone, name, endDate: endDate.toISOString().split("T")[0], type: "payment_details",
              memberIds: [member.id], isManual: true, adminUserId,
              branchId: currentBranch?.id, branchName: currentBranch?.name,
            },
          });
        }
      } catch (err) {
        console.error("Failed to send WhatsApp notification:", err);
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
      return { name } as const;
    } catch (error: any) {
      // Friendly handling for duplicate phone constraint at any insert step
      if (
        error?.code === "23505" ||
        /members_phone_branch_unique|duplicate key/i.test(error?.message || "")
      ) {
        setCurrentStep(1);
        if (currentBranch?.id) await checkExistingMember(phone);
        const e: any = new Error(`${name || "This member"} already exists in this branch.`);
        e.friendly = true;
        throw e;
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle existing member actions (renewal/PT)
  const handleExistingMemberSubmit = async () => {
    if (!existingMember || !currentBranch) return;
    setIsLoading(true);

    try {
      const gymStartDate = new Date(startDate);
      gymStartDate.setHours(0, 0, 0, 0);

      if ((selectedAction === "renew_gym" || selectedAction === "renew_gym_pt") && gymStartDate < minAllowedStartDate) {
        toast.error("Renewal start date is invalid", {
          description: `The next membership must start on ${format(minAllowedStartDate, "d MMM yyyy")} or later.`,
        });
        setStartDate(minAllowedStartDate);
        return;
      }

      // Renew Gym Membership
      if (selectedAction === "renew_gym" || selectedAction === "renew_gym_pt") {
        const gymEndDate = addPackageMonths(gymStartDate, selectedPackage?.months || 1);
        
        const { data: subscription, error: subError } = await supabase
          .from("subscriptions")
          .insert({
            member_id: existingMember.id,
            start_date: formatDateOnly(gymStartDate),
            end_date: formatDateOnly(gymEndDate),
            plan_months: selectedPackage?.months || 1,
            status: "active",
            personal_trainer_id: (selectedAction === "renew_gym_pt" && selectedTrainerId) ? selectedTrainerId : null,
            trainer_fee: (selectedAction === "renew_gym_pt") ? ptFee : null,
            branch_id: currentBranch.id,
          })
          .select()
          .single();
        if (subError) throw subError;

        // Create payment record
        const paymentType = selectedAction === "renew_gym_pt" ? "gym_and_pt" : "gym_renewal";
        const couponNote = adminCoupon.appliedCoupon
          ? ` (Coupon: ${adminCoupon.appliedCoupon.coupon.code}, -₹${couponDiscount})`
          : "";
        // Create payment record only when this isn't a free registration
        // and there's an actual amount (DB requires amount > 0).
        let paymentRecord: { id: string } | null = null;
        if (!registerFree && totalAmount > 0) {
          const { data, error: paymentError } = await supabase.from("payments").insert({
            member_id: existingMember.id,
            subscription_id: subscription.id,
            amount: totalAmount,
            payment_mode: paymentMode,
            status: "success",
            payment_type: paymentType,
            notes: `Renewed via admin dashboard (${paymentMode.toUpperCase()})${couponNote}`,
            branch_id: currentBranch.id,
          }).select().single();
          if (paymentError) throw paymentError;
          paymentRecord = data;
        }

        // Record coupon usage if applied
        if (adminCoupon.appliedCoupon) {
          await supabase.from("coupon_usage").insert({
            coupon_id: adminCoupon.appliedCoupon.coupon.id,
            member_id: existingMember.id,
            payment_id: paymentRecord?.id ?? null,
            discount_applied: couponDiscount,
            branch_id: currentBranch.id,
          });
          await supabase.from("coupons").update({
            usage_count: adminCoupon.appliedCoupon.coupon.usage_count + 1,
          }).eq("id", adminCoupon.appliedCoupon.coupon.id);
        }

        // Ledger entries
        if (monthlyFee > 0) {
          await createMembershipIncomeEntry(
            monthlyFee, "gym_renewal",
            `Renewal - ${existingMember.name} (${selectedPackage?.months || 1} months)`,
            existingMember.id, undefined, paymentRecord?.id, currentBranch.id
          );
        }

        if (joiningFee > 0) {
          await createMembershipIncomeEntry(
            joiningFee, "joining_fee", `Joining fee - ${existingMember.name}`,
            existingMember.id, undefined, paymentRecord?.id, currentBranch.id
          );
        }

        // If also adding PT
        if (selectedAction === "renew_gym_pt" && selectedTrainerId) {
          const ptEndDate = addPackageMonths(gymStartDate, ptMonths);
          const { data: insertedPt } = await supabase.from("pt_subscriptions").insert({
            member_id: existingMember.id,
            personal_trainer_id: selectedTrainerId,
            start_date: formatDateOnly(gymStartDate),
            end_date: formatDateOnly(ptEndDate),
            monthly_fee: selectedTrainer?.monthly_fee || 0,
            total_fee: ptFee,
            status: "active",
            branch_id: currentBranch.id,
          }).select("id").maybeSingle();
          await bindMemberToTimeSlot(insertedPt?.id, existingMember.id);

          if (ptFee > 0) {
            await createMembershipIncomeEntry(
              ptFee, "pt_subscription",
              `PT subscription - ${existingMember.name} with ${selectedTrainer?.name}`,
              existingMember.id, undefined, paymentRecord?.id, currentBranch.id
            );
          }
          if (selectedTrainer) {
            await calculateTrainerPercentageExpense(
              selectedTrainerId, ptFee, existingMember.id, undefined, undefined, existingMember.name, currentBranch.id
            );
          }
        }

        // success toast handled by caller via toast.promise
      }

      // Add PT Only
      if (selectedAction === "add_pt") {
        if (!selectedTrainerId) {
          toast.error("Please select a trainer");
          setIsLoading(false);
          return;
        }

        const ptEndDate = addPackageMonths(gymStartDate, ptMonths);
        const { data: insertedAddPt } = await supabase.from("pt_subscriptions").insert({
          member_id: existingMember.id,
          personal_trainer_id: selectedTrainerId,
          start_date: formatDateOnly(gymStartDate),
          end_date: formatDateOnly(ptEndDate),
          monthly_fee: selectedTrainer?.monthly_fee || 0,
          total_fee: ptFee,
          status: "active",
          branch_id: currentBranch.id,
        }).select("id").maybeSingle();
        await bindMemberToTimeSlot(insertedAddPt?.id, existingMember.id);

        const couponNotePT = adminCoupon.appliedCoupon
          ? ` (Coupon: ${adminCoupon.appliedCoupon.coupon.code}, -₹${couponDiscount})`
          : "";
        // Only insert payment when not a free registration and amount > 0 (DB constraint)
        let paymentRecord: { id: string } | null = null;
        if (!registerFree && totalAmount > 0) {
          const { data, error: paymentError } = await supabase.from("payments").insert({
            member_id: existingMember.id,
            amount: totalAmount,
            payment_mode: paymentMode,
            status: "success",
            payment_type: "pt_subscription",
            notes: `PT added via admin dashboard (${paymentMode.toUpperCase()})${couponNotePT}`,
            branch_id: currentBranch.id,
          }).select().single();
          if (paymentError) throw paymentError;
          paymentRecord = data;
        }

        // Record coupon usage if applied
        if (adminCoupon.appliedCoupon) {
          await supabase.from("coupon_usage").insert({
            coupon_id: adminCoupon.appliedCoupon.coupon.id,
            member_id: existingMember.id,
            payment_id: paymentRecord?.id ?? null,
            discount_applied: couponDiscount,
            branch_id: currentBranch.id,
          });
          await supabase.from("coupons").update({
            usage_count: adminCoupon.appliedCoupon.coupon.usage_count + 1,
          }).eq("id", adminCoupon.appliedCoupon.coupon.id);
        }

        if (ptFee > 0) {
          await createMembershipIncomeEntry(
            ptFee, "pt_subscription",
            `PT subscription - ${existingMember.name} with ${selectedTrainer?.name}`,
            existingMember.id, undefined, paymentRecord?.id, currentBranch.id
          );
        }
        if (selectedTrainer) {
          await calculateTrainerPercentageExpense(
            selectedTrainerId, ptFee, existingMember.id, undefined, undefined, existingMember.name, currentBranch.id
          );
        }

        // success toast handled by caller via toast.promise
      }

      // Log activity
      const actionDesc = selectedAction === "add_pt" ? "added PT for" : "renewed";
      const paymentTagEx = registerFree ? "FREE" : paymentMode.toUpperCase();
      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: selectedAction === "add_pt" ? "subscriptions" : "members",
          type: selectedAction === "add_pt" ? "pt_subscription_added" : "subscription_renewed",
          description: registerFree
            ? `Staff "${staffUser.fullName}" ${actionDesc} "${existingMember.name}" FREE (no payment collected)`
            : `Staff "${staffUser.fullName}" ${actionDesc} "${existingMember.name}" (${paymentTagEx})`,
          entityType: "members", entityId: existingMember.id, entityName: existingMember.name,
          newValue: { action: selectedAction, total_amount: totalAmount, payment_mode: registerFree ? "free" : paymentMode, registered_free: registerFree },
          branchId: currentBranch.id, staffId: staffUser.id, staffName: staffUser.fullName,
          staffPhone: staffUser.phone, metadata: { staff_role: staffUser.role, registered_free: registerFree },
        });
      } else {
        await logAdminActivity({
          category: selectedAction === "add_pt" ? "subscriptions" : "members",
          type: selectedAction === "add_pt" ? "pt_subscription_added" : "subscription_renewed",
          description: registerFree
            ? `${selectedAction === "add_pt" ? "Added PT for" : "Renewed"} "${existingMember.name}" FREE (no payment collected)`
            : `${selectedAction === "add_pt" ? "Added PT for" : "Renewed"} "${existingMember.name}" (${paymentTagEx})`,
          entityType: "members", entityId: existingMember.id, entityName: existingMember.name,
          newValue: { action: selectedAction, total_amount: totalAmount, payment_mode: registerFree ? "free" : paymentMode, registered_free: registerFree },
          branchId: currentBranch.id,
          metadata: { registered_free: registerFree },
        });
      }

      // Send WhatsApp notifications for existing member actions
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const adminUserId = session?.user?.id || null;
        const endDateStr = selectedAction === "add_pt" 
          ? formatDateOnly(addPackageMonths(new Date(startDate), ptMonths))
          : formatDateOnly(addPackageMonths(new Date(startDate), selectedPackage?.months || 1));
        
        const notificationType = selectedAction === "add_pt" ? "pt_extension" : "renewal";
        if (notifyWhatsApp) {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone: existingMember.phone, name: existingMember.name, endDate: endDateStr,
              type: notificationType, memberIds: [existingMember.id], isManual: true, adminUserId,
              branchId: currentBranch.id, branchName: currentBranch.name,
            },
          });
        }
        
        // Send payment receipt if enabled
        const shouldSendReceipt = await getWhatsAppAutoSendPreference(currentBranch?.id, "payment_details");
        if (shouldSendReceipt) {
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone: existingMember.phone, name: existingMember.name, endDate: endDateStr,
              type: "payment_details", memberIds: [existingMember.id], isManual: true, adminUserId,
              branchId: currentBranch.id, branchName: currentBranch.name,
            },
          });
        }
      } catch (err) {
        console.error("Failed to send WhatsApp notification:", err);
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
      return { action: selectedAction } as const;
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  const resetForm = () => {
    setName(""); setPhone(""); setFieldErrors({}); setTouched({});
    setGender(""); setAddress(""); setPhotoIdType(""); setPhotoIdNumber("");
    setDateOfBirth(undefined); setSelectedPackageId(""); setMonthlyFee(0);
    setJoiningFee(0); setWantsPT(false); setSelectedTrainerId("");
    setPtMonths(1); setPtFee(0); setCurrentStep(1); setPaymentMode("cash");
    setTrainerTimeSlots([]); setSelectedTimeSlotId("");
    setExistingMember(null); setSelectedAction(null); setIsCheckingPhone(false);
    setEmail(""); setOccupation("");
    setBloodGroup(""); setHeightCm(""); setWeightKg(""); setMedicalConditions(""); setAllergies("");
    setEmergencyContact1Name(""); setEmergencyContact1Phone("");
    setEmergencyContact2Name(""); setEmergencyContact2Phone("");
    setIdentityFiles([]); setMedicalFiles([]);
    setNotifyWhatsApp(true);
    setRegisterFree(false);
    adminCoupon.removeCoupon();
    const today = new Date(); today.setHours(0, 0, 0, 0); setStartDate(today);
  };

  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 10);
  const minDobDate = new Date();
  minDobDate.setFullYear(minDobDate.getFullYear() - 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] flex flex-col p-0 rounded-2xl gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg font-bold text-center">
            {isExistingMemberAction 
              ? selectedAction === "renew_gym" ? "Renew Membership" 
                : selectedAction === "add_pt" ? "Add Personal Training"
                : "Renew Gym + PT"
              : "Add New Member"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-center text-muted-foreground">
            {isExistingMemberAction && existingMember
              ? `For ${existingMember.name} · ${existingMember.phone}`
              : `Step ${currentStep} of 3 — ${STEPS[currentStep - 1].title} Details`}
          </DialogDescription>
          {!isExistingMemberAction && phone.length === 10 && currentStep > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <Phone className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">+91 {phone}</span>
            </div>
          )}
        </DialogHeader>

        {/* Step Indicator */}
        <div className="px-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between relative">
            {/* Progress line */}
            <div className="absolute top-4 left-[16.6%] right-[16.6%] h-0.5 bg-border">
              <div 
                className="h-full bg-foreground transition-all duration-500 ease-out rounded-full"
                style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
              />
            </div>
            
            {STEPS.map((step) => {
              const StepIcon = step.icon;
              const isCompleted = currentStep > step.id;
              const isActive = currentStep === step.id;
              return (
                <div
                  key={step.id}
                  className="flex flex-col items-center gap-1.5 relative z-10"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300",
                    isCompleted && "bg-foreground text-background scale-100",
                    isActive && "bg-foreground text-background scale-110 shadow-md",
                    !isCompleted && !isActive && "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <StepIcon className="w-4 h-4" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium transition-colors duration-200",
                    (isActive || isCompleted) ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5">
          <div className="flex flex-col min-h-full">
            <div 
              key={currentStep}
              className={cn(
                "flex-1 space-y-4 animate-fade-in",
                slideDirection === "left" ? "motion-safe:animate-fade-in" : "motion-safe:animate-fade-in"
              )}
            >
              {/* Step 1: Contact Details - Phone Only */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2" style={{ animationDelay: "50ms" }}>
                    <Label htmlFor="add-phone" className="flex items-center gap-2 text-sm font-medium">
                      <Phone className="w-4 h-4 text-accent" />
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex relative">
                      <span className="inline-flex items-center px-3 rounded-l-xl border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
                        +91
                      </span>
                      <Input
                        id="add-phone"
                        type="tel"
                        placeholder="9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="rounded-l-none rounded-r-xl h-11 text-sm pr-10"
                        required
                        autoFocus
                      />
                      {isCheckingPhone && (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                      )}
                    </div>
                  </div>

                  {/* Existing Member Found Card */}
                  {existingMember && (
                    <div className="animate-fade-in rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <UserCheck className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{existingMember.name}</p>
                          <p className="text-xs text-muted-foreground">Member already exists in this branch</p>
                        </div>
                      </div>

                      {/* Current status */}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {existingMember.subscription ? (
                          <span className={cn(
                            "px-2 py-0.5 rounded-full font-medium",
                            existingMember.subscription.status === "active" 
                              ? "bg-primary/10 text-primary"
                              : "bg-destructive/10 text-destructive"
                          )}>
                            Gym: {existingMember.subscription.status === "active" ? "Active" : "Expired"} 
                            {" · "}Ends {format(new Date(existingMember.subscription.end_date), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            No Subscription
                          </span>
                        )}
                        {existingMember.activePT ? (
                          <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                            PT: {existingMember.activePT.trainer_name} · Ends {format(new Date(existingMember.activePT.end_date), "dd MMM yyyy")}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            No PT
                          </span>
                        )}
                      </div>

                      {/* Action Options */}
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">What would you like to do?</p>
                        <div className="grid grid-cols-1 gap-2">
                          {(() => {
                            const memberHasActiveMembership = existingMember.subscription && 
                              existingMember.subscription.status === "active" && 
                              isAfter(new Date(existingMember.subscription.end_date), new Date());
                            
                            return [
                              { 
                                key: "renew_gym" as const, 
                                label: "Renew Gym Membership", 
                                icon: RefreshCw,
                                desc: "Extend gym subscription",
                                requiresTrainers: false,
                                requiresActiveMembership: false,
                              },
                              { 
                                key: "add_pt" as const, 
                                label: "Add Personal Training", 
                                icon: Dumbbell,
                                desc: memberHasActiveMembership 
                                  ? `PT can be added till ${format(new Date(existingMember.subscription!.end_date), "d MMM yyyy")}`
                                  : "Requires active gym membership",
                                requiresTrainers: true,
                                requiresActiveMembership: true,
                              },
                              { 
                                key: "renew_gym_pt" as const, 
                                label: "Renew Gym + PT", 
                                icon: Calendar,
                                desc: "Renew gym and add PT together",
                                requiresTrainers: true,
                                requiresActiveMembership: false,
                              },
                            ]
                            .filter((action) => !action.requiresTrainers || trainers.length > 0)
                            .map((action) => {
                              const isDisabled = action.requiresActiveMembership && !memberHasActiveMembership;
                              return (
                                <button
                                  key={action.key}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    if (isDisabled) return;
                                    setSelectedAction(action.key);
                                    if (action.key === "add_pt") {
                                      setWantsPT(true);
                                    } else if (action.key === "renew_gym_pt") {
                                      setWantsPT(true);
                                    } else {
                                      setWantsPT(false);
                                    }
                                    setSlideDirection("left");
                                    setCurrentStep(3);
                                  }}
                                  className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200",
                                    isDisabled
                                      ? "border-border bg-muted/50 opacity-50 cursor-not-allowed"
                                      : "border-border bg-background hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
                                  )}
                                >
                                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                    <action.icon className="w-4 h-4 text-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{action.label}</p>
                                    <p className="text-[11px] text-muted-foreground">{action.desc}</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Personal Details (now includes Name) */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  {/* Full Name - moved from Step 1 */}
                  <div className="space-y-2" style={{ animationDelay: "50ms" }}>
                    <Label htmlFor="add-name" className="flex items-center gap-2 text-sm font-medium">
                      <User className="w-4 h-4 text-accent" />
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <ValidatedInput
                      id="add-name"
                      placeholder="Enter member name"
                      value={name}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-Z\s.']/g, "");
                        setName(val);
                        if (touched.name) setFieldErrors((prev) => ({ ...prev, name: validateField(nameSchema, val) }));
                      }}
                      onValidate={(v) => {
                        setTouched((prev) => ({ ...prev, name: true }));
                        setFieldErrors((prev) => ({ ...prev, name: validateField(nameSchema, v) }));
                      }}
                      error={touched.name ? fieldErrors.name : undefined}
                      className="h-11 text-sm rounded-xl"
                      autoFocus
                    />
                  </div>

                  {showGender && (
                    <div className="space-y-2.5">
                      <Label className="text-sm font-medium">Gender {fs.gender?.required !== false && <span className="text-destructive">*</span>}</Label>
                      <div className="flex gap-2">
                        {[
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                          { value: "other", label: "Other" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setGender(opt.value)}
                            className={cn(
                              "flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 active:scale-95",
                              gender === opt.value
                                ? "border-foreground bg-foreground/5 text-foreground shadow-sm"
                                : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showDOB && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <CalendarDays className="w-4 h-4 text-accent" />
                        Date of Birth {dobRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <DobInput value={dateOfBirth} onChange={setDateOfBirth} />
                    </div>
                  )}

                  {showEmail && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="w-4 h-4 text-accent" />
                        Email {emailRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        type="email"
                        placeholder="member@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 text-sm rounded-xl"
                      />
                    </div>
                  )}

                  {showOccupation && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Briefcase className="w-4 h-4 text-accent" />
                        Occupation {occupationRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        placeholder="e.g. Software Engineer"
                        value={occupation}
                        onChange={(e) => setOccupation(e.target.value)}
                        className="h-11 text-sm rounded-xl"
                      />
                    </div>
                  )}

                  {showBloodGroup && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Droplets className="w-4 h-4 text-accent" />
                        Blood Group {bloodGroupRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <Select value={bloodGroup} onValueChange={setBloodGroup}>
                        <SelectTrigger className="h-11 text-sm rounded-xl">
                          <SelectValue placeholder="Select blood group" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => (
                            <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {showPhotoId && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <IdCard className="w-4 h-4 text-accent" />
                        Photo ID Type {photoIdRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <Select value={photoIdType} onValueChange={(val) => { setPhotoIdType(val); setPhotoIdNumber(""); }}>
                        <SelectTrigger className="h-11 text-sm rounded-xl">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="aadhaar">Aadhaar</SelectItem>
                          <SelectItem value="pan">PAN</SelectItem>
                          <SelectItem value="voter">Voter ID</SelectItem>
                          <SelectItem value="driving">Driving License</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {showPhotoId && photoIdType && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="text-sm font-medium">
                        {photoIdType === "aadhaar" ? "Aadhaar" : photoIdType === "pan" ? "PAN" : photoIdType === "voter" ? "Voter ID" : "DL"} Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder={photoIdType === "aadhaar" ? "XXXX XXXX XXXX" : photoIdType === "pan" ? "ABCDE1234F" : "ID Number"}
                        value={photoIdNumber}
                        onChange={(e) => setPhotoIdNumber(formatIdNumber(e.target.value, photoIdType))}
                        maxLength={photoIdType === "aadhaar" ? 14 : photoIdType === "pan" ? 10 : 20}
                        className="h-11 text-sm rounded-xl"
                      />
                    </div>
                  )}

                  {showAddress && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <MapPin className="w-4 h-4 text-accent" />
                        Address {addressRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <Input
                        placeholder="Enter address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="h-11 text-sm rounded-xl"
                      />
                    </div>
                  )}

                  {showHealth && (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-3 animate-fade-in">
                      <p className="text-sm font-medium flex items-center gap-2"><Heart className="w-4 h-4 text-accent" /> Health Details {healthRequired && <span className="text-destructive">*</span>}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                          <Input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="h-10 text-sm rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                          <Input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="h-10 text-sm rounded-xl" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Medical Conditions</Label>
                        <Textarea value={medicalConditions} onChange={(e) => setMedicalConditions(e.target.value)} placeholder="Any medical conditions" className="text-sm rounded-xl min-h-[60px]" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Allergies</Label>
                        <Textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Any allergies" className="text-sm rounded-xl min-h-[60px]" />
                      </div>
                    </div>
                  )}

                  {showEC1 && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <ShieldAlert className="w-4 h-4 text-accent" />
                        Emergency Contact {ec1Required && <span className="text-destructive">*</span>}
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Name" value={emergencyContact1Name} onChange={(e) => setEmergencyContact1Name(e.target.value)} className="h-11 text-sm rounded-xl" />
                        <Input placeholder="Phone" value={emergencyContact1Phone} onChange={(e) => setEmergencyContact1Phone(e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-11 text-sm rounded-xl" />
                      </div>
                    </div>
                  )}

                  {showEC2 && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <ShieldAlert className="w-4 h-4 text-accent" />
                        Emergency Contact 2 {ec2Required && <span className="text-destructive">*</span>}
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Name" value={emergencyContact2Name} onChange={(e) => setEmergencyContact2Name(e.target.value)} className="h-11 text-sm rounded-xl" />
                        <Input placeholder="Phone" value={emergencyContact2Phone} onChange={(e) => setEmergencyContact2Phone(e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-11 text-sm rounded-xl" />
                      </div>
                    </div>
                  )}

                  {showIdentityUpload && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Upload className="w-4 h-4 text-accent" />
                        Identity Proof Upload {identityRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <label className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-border hover:border-foreground/30 cursor-pointer text-sm text-muted-foreground transition-colors">
                        <Upload className="w-4 h-4" />
                        {isUploading ? "Uploading..." : "Click to upload (PDF/Image, max 5MB)"}
                        <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "identity")} />
                      </label>
                      {identityFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted rounded-lg p-2">
                          <span className="flex items-center gap-1.5 truncate"><FileText className="w-3.5 h-3.5 shrink-0" />{f.name}</span>
                          <button type="button" onClick={() => setIdentityFiles((p) => p.filter((_, idx) => idx !== i))}><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showMedicalUpload && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="w-4 h-4 text-accent" />
                        Medical Records Upload {medicalRequired && <span className="text-destructive">*</span>}
                      </Label>
                      <label className="flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-border hover:border-foreground/30 cursor-pointer text-sm text-muted-foreground transition-colors">
                        <Upload className="w-4 h-4" />
                        {isUploading ? "Uploading..." : "Click to upload (PDF/Image, max 5MB)"}
                        <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], "medical")} />
                      </label>
                      {medicalFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted rounded-lg p-2">
                          <span className="flex items-center gap-1.5 truncate"><FileText className="w-3.5 h-3.5 shrink-0" />{f.name}</span>
                          <button type="button" onClick={() => setMedicalFiles((p) => p.filter((_, idx) => idx !== i))}><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Package Selection */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  {/* Start Date */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="w-4 h-4 text-accent" />
                      {isPTOnly ? "PT Start Date" : "Membership Start Date"}
                    </Label>
                    <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full p-3 rounded-xl border-2 border-input hover:border-foreground/30 bg-card flex items-center justify-between transition-all duration-200"
                        >
                          <span className="font-medium text-sm">{format(startDate, "d MMMM yyyy")}</span>
                          <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                          <CalendarComponent
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => {
                            if (date) { setStartDate(date); setShowDatePicker(false); }
                          }}
                          disabled={(date) => {
                              const candidate = new Date(date);
                              candidate.setHours(0, 0, 0, 0);
                              const minDate = new Date(minAllowedStartDate);
                              minDate.setHours(0, 0, 0, 0);
                              return candidate < minDate;
                          }}
                            defaultMonth={startDate < minAllowedStartDate ? minAllowedStartDate : startDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {(selectedAction === "renew_gym" || selectedAction === "renew_gym_pt") && existingMember?.subscription?.end_date && (
                      <p className="text-xs text-muted-foreground">
                        Current membership ends on {format(parseDateOnly(existingMember.subscription.end_date) || minAllowedStartDate, "d MMM yyyy")}. Renewal can start from {format(minAllowedStartDate, "d MMM yyyy")}. 
                      </p>
                    )}
                  </div>
                  
                  {/* Duration - only for gym actions */}
                  {showGymSection && (
                    <>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <Calendar className="w-4 h-4 text-accent" />
                          Duration <span className="text-destructive">*</span>
                        </Label>
                        <Select value={selectedPackageId} onValueChange={handlePackageChange}>
                          <SelectTrigger className="h-11 text-sm rounded-xl">
                            <SelectValue placeholder="Select package" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {monthlyPackages.map((pkg) => (
                              <SelectItem key={pkg.id} value={pkg.id}>
                                {pkg.months} {pkg.months === 1 ? "Month" : "Months"} - ₹{pkg.price}
                                {!isExistingMemberAction && pkg.joining_fee > 0 ? ` + ₹${pkg.joining_fee} joining` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Editable Fees — joining fee is hidden for renewals/PT-only */}
                      <div className={cn("grid gap-3", isExistingMemberAction ? "grid-cols-1" : "grid-cols-2")}>
                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <IndianRupee className="w-3 h-3" />
                            Monthly Fee
                          </Label>
                          <Input
                            type="number"
                            min={registerFree ? 0 : 1}
                            step={1}
                            value={registerFree ? 0 : monthlyFee}
                            disabled={registerFree}
                            onChange={(e) => handleFeeInput(e.target.value, setMonthlyFee)}
                            className="h-10 text-sm rounded-xl disabled:opacity-60"
                          />
                        </div>
                        {!isExistingMemberAction && (
                          <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <IndianRupee className="w-3 h-3" />
                              Joining Fee
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={registerFree ? 0 : joiningFee}
                              disabled={registerFree}
                              onChange={(e) => {
                                // joining fee can be 0 (some packages have no joining fee), but never negative
                                const v = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0);
                                setJoiningFee(v);
                              }}
                              className="h-10 text-sm rounded-xl disabled:opacity-60"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* PT Section - only show if trainers exist */}
                  {showPTSection && trainers.length > 0 && (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          <Dumbbell className="w-4 h-4 text-muted-foreground" />
                          Personal Training
                        </span>
                        {!isPTOnly && (
                          <Switch checked={wantsPT} onCheckedChange={setWantsPT} />
                        )}
                        {isPTOnly && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Required</span>
                        )}
                      </div>

                      {(wantsPT || isPTOnly) && trainers.length > 0 && (
                        <div className="space-y-3 animate-fade-in">
                          <Select value={selectedTrainerId} onValueChange={handleTrainerChange}>
                            <SelectTrigger className="h-10 text-sm rounded-xl">
                              <SelectValue placeholder="Choose trainer" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {trainers.map((trainer) => (
                                <SelectItem key={trainer.id} value={trainer.id}>
                                  {trainer.name} - ₹{trainer.monthly_fee}/mo
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">PT Duration</Label>
                              <Select value={String(ptMonths)} onValueChange={(v) => handlePtMonthsChange(Number(v))}>
                                <SelectTrigger className="h-10 text-sm rounded-xl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  {ptMonthOptions.map((m) => (
                                    <SelectItem key={m} value={String(m)}>
                                      {m} {m === 1 ? "Month" : "Months"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">PT Fee (₹)</Label>
                              <Input
                                type="number"
                                min={registerFree ? 0 : 1}
                                step={1}
                                value={registerFree ? 0 : ptFee}
                                disabled={registerFree}
                                onChange={(e) => handleFeeInput(e.target.value, setPtFee)}
                                className="h-10 text-sm rounded-xl disabled:opacity-60"
                              />
                            </div>
                          </div>

                          {/* Optional Time Slot — only shown when the selected trainer
                              has configured slots in the schedule. Picking a slot is OPTIONAL. */}
                          {selectedTrainerId && (isFetchingTimeSlots || trainerTimeSlots.length > 0) && (
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                Time Slot <span className="text-muted-foreground/70">(optional)</span>
                              </Label>
                              <Select
                                value={selectedTimeSlotId || "none"}
                                onValueChange={(v) => setSelectedTimeSlotId(v === "none" ? "" : v)}
                                disabled={isFetchingTimeSlots}
                              >
                                <SelectTrigger className="h-10 text-sm rounded-xl">
                                  <SelectValue placeholder={isFetchingTimeSlots ? "Loading slots…" : "No slot assigned"} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value="none">No slot assigned</SelectItem>
                                  {trainerTimeSlots.map((slot) => {
                                    const full = slot.current_count >= slot.capacity;
                                    return (
                                      <SelectItem key={slot.id} value={slot.id} disabled={full}>
                                        {formatSlotTime(slot.start_time)} – {formatSlotTime(slot.end_time)}
                                        {" · "}{slot.current_count}/{slot.capacity}
                                        {full ? " (Full)" : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {gymMembershipEndDate && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                              <Calendar className="w-3 h-3" />
                              PT can only be added till gym membership end date: {format(gymMembershipEndDate, "d MMM yyyy")}
                            </p>
                          )}
                          {ptMonthOptions.length === 0 && (wantsPT || isPTOnly) && (
                            <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
                              <Calendar className="w-3 h-3" />
                              Gym membership period is too short for PT. Please extend gym membership first.
                            </p>
                          )}
                        </div>
                      )}
                      {(wantsPT || isPTOnly) && trainers.length === 0 && (
                        <p className="text-xs text-muted-foreground">No active trainers. Add them in settings.</p>
                      )}
                    </div>
                  )}

                  {/* Register Free toggle — when on, no payment is collected/recorded */}
                  <label
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                      registerFree
                        ? "border-success/40 bg-success/5"
                        : "border-border/60 bg-card hover:bg-muted/30"
                    )}
                  >
                    <Switch
                      checked={registerFree}
                      onCheckedChange={(v) => {
                        setRegisterFree(v);
                        // Clear any applied coupon when switching into free mode — discounts no longer apply
                        if (v) adminCoupon.removeCoupon();
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Check className={cn("w-3.5 h-3.5", registerFree ? "text-success" : "text-muted-foreground")} />
                        Register Free
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {registerFree
                          ? "No payment will be recorded. Member is registered free of charge."
                          : "Skip payment entirely — useful for complimentary, trial, or staff registrations."}
                      </p>
                    </div>
                  </label>

                  {/* Payment Mode Selection — hidden when registering free */}
                  {!registerFree && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <IndianRupee className="w-4 h-4 text-accent" />
                        Payment Method <span className="text-destructive">*</span>
                      </Label>
                      <div className="flex gap-2">
                        {[
                          { value: "cash" as const, label: "Cash" },
                          { value: "upi" as const, label: "UPI" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPaymentMode(opt.value)}
                            className={cn(
                              "flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 active:scale-95",
                              paymentMode === opt.value
                                ? "border-foreground bg-foreground/5 text-foreground shadow-sm"
                                : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Price Summary */}
                  <div className="bg-muted/40 rounded-xl p-4 space-y-2.5 border border-border/40">
                    {showGymSection && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Membership ({selectedPackage?.months || 0}mo)</span>
                        <span className={cn("font-semibold tabular-nums", registerFree && "line-through text-muted-foreground")}>
                          ₹{monthlyFee.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                    {showGymSection && joiningFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Joining Fee</span>
                        <span className={cn("font-semibold tabular-nums", registerFree && "line-through text-muted-foreground")}>
                          ₹{joiningFee.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                    {(wantsPT || isPTOnly) && (
                      <div className="flex justify-between text-sm animate-fade-in">
                        <span className="text-muted-foreground">PT ({ptMonths}mo)</span>
                        <span className={cn("font-semibold tabular-nums", registerFree && "line-through text-muted-foreground")}>
                          ₹{ptFee.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                    {!registerFree && taxEnabled && taxAmount > 0 && (
                      <div className="flex justify-between text-sm animate-fade-in">
                        <span className="text-muted-foreground">GST ({taxRate}%)</span>
                        <span className="font-semibold tabular-nums">₹{taxAmount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {!registerFree && couponDiscount > 0 && (
                      <div className="flex justify-between text-sm text-success animate-fade-in">
                        <span>Coupon ({adminCoupon.appliedCoupon?.coupon.code})</span>
                        <span className="font-semibold tabular-nums">-₹{couponDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-2.5 border-t border-border/60 text-base">
                      <span>
                        {registerFree
                          ? "Total"
                          : `Total (${paymentMode === "upi" ? "UPI" : "Cash"})`}
                      </span>
                      {registerFree ? (
                        <span className="text-success tabular-nums flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> FREE
                        </span>
                      ) : (
                        <span className="text-foreground tabular-nums">₹{totalAmount.toLocaleString("en-IN")}</span>
                      )}
                    </div>
                  </div>

                  {/* Coupon Input — hidden when registering free */}
                  {!registerFree && (
                    <CouponInput
                      couponCode={adminCoupon.couponCode}
                      onCouponCodeChange={adminCoupon.setCouponCode}
                      onApply={adminCoupon.validateCoupon}
                      onRemove={adminCoupon.removeCoupon}
                      isValidating={adminCoupon.isValidating}
                      appliedCoupon={adminCoupon.appliedCoupon}
                      error={adminCoupon.couponError}
                      compact
                    />
                  )}

                  {/* Notify member via WhatsApp */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 cursor-pointer transition-colors">
                    <Checkbox
                      checked={notifyWhatsApp}
                      onCheckedChange={(v) => setNotifyWhatsApp(v === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Notify member via WhatsApp
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Sends a registration confirmation to the member's phone after submit.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 py-4 mt-auto flex-shrink-0 sticky bottom-0 bg-background">
              {currentStep > 1 && !isExistingMemberAction ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl text-sm font-medium active:scale-[0.98] transition-all duration-200"
                  onClick={() => goToStep(currentStep - 1)}
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-11 rounded-xl text-sm font-medium active:scale-[0.98] transition-all duration-200"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              )}
              
              {currentStep < 3 ? (
                <Button
                  type="button"
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 shadow-sm"
                  onClick={() => goToStep(currentStep + 1)}
                  disabled={(currentStep === 1 && !isStep1Valid) || (currentStep === 2 && !isStep2Valid)}
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={isExistingMemberAction ? handleExistingMemberSubmit : handleSubmit}
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 shadow-sm"
                  disabled={isLoading || !isStep3Valid}
                >
                  {isLoading ? (
                    <>
                      <ButtonSpinner className="mr-2" />
                      {isExistingMemberAction ? "Processing..." : "Adding..."}
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-1.5" />
                      {registerFree
                        ? (selectedAction === "renew_gym" ? "Renew Free"
                          : selectedAction === "add_pt" ? "Add PT Free"
                          : selectedAction === "renew_gym_pt" ? "Renew + PT Free"
                          : "Register Free")
                        : (selectedAction === "renew_gym" ? "Renew Membership"
                          : selectedAction === "add_pt" ? "Add PT"
                          : selectedAction === "renew_gym_pt" ? "Renew + Add PT"
                          : "Add Member")}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
