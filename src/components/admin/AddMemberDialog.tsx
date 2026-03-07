import { useState, useEffect } from "react";
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
} from "lucide-react";
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
import { format, addMonths } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getWhatsAppAutoSendPreference } from "@/utils/whatsappAutoSend";
import { ButtonSpinner } from "@/components/ui/button-spinner";

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
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STEPS = [
  { id: 1, title: "Contact", icon: User },
  { id: 2, title: "Personal", icon: IdCard },
  { id: 3, title: "Package", icon: Calendar },
] as const;

export const AddMemberDialog = ({ open, onOpenChange, onSuccess }: AddMemberDialogProps) => {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  
  const [currentStep, setCurrentStep] = useState(1);
  
  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  // Personal details
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<string | undefined>(undefined);
  
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

  useEffect(() => {
    if (open && currentBranch) {
      fetchPackages();
      fetchTrainers();
      setCurrentStep(1);
    }
  }, [open, currentBranch]);

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
      setJoiningFee(Number(data[0].joining_fee));
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
      setTrainers(data);
      setSelectedTrainerId(data[0].id);
      setPtFee(Number(data[0].monthly_fee));
    } else {
      setTrainers([]);
      setSelectedTrainerId("");
      setPtFee(0);
    }
  };

  const handlePackageChange = (packageId: string) => {
    setSelectedPackageId(packageId);
    const pkg = monthlyPackages.find((p) => p.id === packageId);
    if (pkg) {
      setMonthlyFee(Number(pkg.price));
      setJoiningFee(Number(pkg.joining_fee));
      if (ptMonths > pkg.months) setPtMonths(pkg.months);
    }
  };

  const handleTrainerChange = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) setPtFee(Number(trainer.monthly_fee) * ptMonths);
  };

  const handlePtMonthsChange = (months: number) => {
    setPtMonths(months);
    const trainer = trainers.find((t) => t.id === selectedTrainerId);
    if (trainer) setPtFee(Number(trainer.monthly_fee) * months);
  };

  const selectedPackage = monthlyPackages.find((p) => p.id === selectedPackageId);
  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);
  const gymTotal = monthlyFee + joiningFee;
  const totalAmount = gymTotal + (wantsPT ? ptFee : 0);

  const ptMonthOptions = [];
  const maxPtMonths = selectedPackage?.months || 1;
  for (let i = 1; i <= maxPtMonths; i++) {
    ptMonthOptions.push(i);
  }

  const formatIdNumber = (value: string, type: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (type === "aadhaar") {
      return cleaned.replace(/(.{4})/g, "$1 ").trim().slice(0, 14);
    }
    return cleaned;
  };

  // Step validation
  const isStep1Valid = name.trim().length >= 2 && phone.length === 10;
  const isStep2Valid = true; // Personal details are optional
  const isStep3Valid = !!selectedPackageId;

  const goToStep = (step: number) => {
    if (step > currentStep) {
      // Validate current step before advancing
      if (currentStep === 1 && !isStep1Valid) {
        const sanitizedName = sanitize(name);
        const result = validateForm(addMemberSchema, { name: sanitizedName, phone });
        if (!result.success) {
          setFieldErrors(result.errors);
          setTouched({ name: true, phone: true });
          return;
        }
      }
      setSlideDirection("left");
    } else {
      setSlideDirection("right");
    }
    setCurrentStep(step);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .eq("branch_id", currentBranch?.id || "")
        .maybeSingle();

      if (existing) {
        toast.error("Member Exists", {
          description: "A member with this phone number already exists in this branch",
        });
        setIsLoading(false);
        return;
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name, phone, branch_id: currentBranch?.id || "" })
        .select()
        .single();
      if (memberError) throw memberError;

      if (gender || address || photoIdType || photoIdNumber || dateOfBirth) {
        const { error: detailsError } = await supabase.from("member_details").insert({
          member_id: member.id,
          gender: gender || null,
          address: address || null,
          photo_id_type: photoIdType || null,
          photo_id_number: photoIdNumber || null,
          date_of_birth: dateOfBirth || null,
          personal_trainer_id: wantsPT ? selectedTrainerId : null,
        });
        if (detailsError) throw detailsError;
      }

      const gymStartDate = new Date(startDate);
      gymStartDate.setHours(0, 0, 0, 0);
      const endDate = addMonths(gymStartDate, selectedPackage?.months || 1);

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: gymStartDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
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
        const ptEndDate = addMonths(gymStartDate, ptMonths);
        await supabase.from("pt_subscriptions").insert({
          member_id: member.id,
          personal_trainer_id: selectedTrainerId,
          start_date: gymStartDate.toISOString().split("T")[0],
          end_date: ptEndDate.toISOString().split("T")[0],
          monthly_fee: selectedTrainer?.monthly_fee || 0,
          total_fee: ptFee,
          status: "active",
          branch_id: currentBranch?.id,
        });
      }

      const paymentType = wantsPT ? "gym_and_pt" : "gym_membership";
      const { data: paymentRecord, error: paymentError } = await supabase.from("payments").insert({
        member_id: member.id,
        subscription_id: subscription.id,
        amount: totalAmount,
        payment_mode: "cash",
        status: "success",
        payment_type: paymentType,
        notes: "Added via admin dashboard",
        branch_id: currentBranch?.id,
      }).select().single();
      if (paymentError) throw paymentError;

      await createMembershipIncomeEntry(
        monthlyFee, "gym_membership",
        `New member - ${name} (${selectedPackage?.months || 1} months)`,
        member.id, undefined, paymentRecord.id, currentBranch?.id
      );

      if (joiningFee > 0) {
        await createMembershipIncomeEntry(
          joiningFee, "joining_fee", `Joining fee - ${name}`,
          member.id, undefined, paymentRecord.id, currentBranch?.id
        );
      }

      if (wantsPT && ptFee > 0 && selectedTrainer) {
        await createMembershipIncomeEntry(
          ptFee, "pt_subscription",
          `PT subscription - ${name} with ${selectedTrainer.name}`,
          member.id, undefined, paymentRecord.id, currentBranch?.id
        );
        await calculateTrainerPercentageExpense(
          selectedTrainerId, ptFee, member.id, undefined, undefined, name, currentBranch?.id
        );
      }

      if (isStaffLoggedIn && staffUser) {
        await logStaffActivity({
          category: "members", type: "member_added",
          description: `Staff "${staffUser.fullName}" added new member "${name}" with ${selectedPackage?.months || 1} month package`,
          entityType: "members", entityId: member.id, entityName: name,
          newValue: { name, phone, package_months: selectedPackage?.months, total_amount: totalAmount, with_pt: wantsPT },
          branchId: currentBranch?.id, staffId: staffUser.id, staffName: staffUser.fullName,
          staffPhone: staffUser.phone, metadata: { staff_role: staffUser.role },
        });
      } else {
        await logAdminActivity({
          category: "members", type: "member_added",
          description: `Added new member "${name}" with ${selectedPackage?.months || 1} month package`,
          entityType: "members", entityId: member.id, entityName: name,
          newValue: { name, phone, package_months: selectedPackage?.months, total_amount: totalAmount, with_pt: wantsPT },
          branchId: currentBranch?.id,
        });
      }

      try {
        const shouldAutoSend = await getWhatsAppAutoSendPreference(currentBranch?.id, "admin_add_member");
        if (shouldAutoSend) {
          const { data: { session } } = await supabase.auth.getSession();
          const adminUserId = session?.user?.id || null;
          await supabase.functions.invoke("send-whatsapp", {
            body: {
              phone, name, endDate: endDate.toISOString().split("T")[0], type: "renewal",
              memberIds: [member.id], isManual: true, adminUserId,
              branchId: currentBranch?.id, branchName: currentBranch?.name,
            },
          });
        }
      } catch (err) {
        console.error("Failed to send WhatsApp notification:", err);
      }

      toast.success("Member added successfully");
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error("Error", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName(""); setPhone(""); setFieldErrors({}); setTouched({});
    setGender(""); setAddress(""); setPhotoIdType(""); setPhotoIdNumber("");
    setDateOfBirth(undefined); setSelectedPackageId(""); setMonthlyFee(0);
    setJoiningFee(0); setWantsPT(false); setSelectedTrainerId("");
    setPtMonths(1); setPtFee(0); setCurrentStep(1);
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
          <DialogTitle className="text-base sm:text-lg font-bold text-center">Add New Member</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-center text-muted-foreground">
            Step {currentStep} of 3 — {STEPS[currentStep - 1].title} Details
          </DialogDescription>
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
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (step.id < currentStep) goToStep(step.id);
                    else if (step.id === currentStep + 1 && (currentStep === 1 ? isStep1Valid : true)) goToStep(step.id);
                  }}
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5">
          <form onSubmit={handleSubmit} className="flex flex-col min-h-full">
            <div 
              key={currentStep}
              className={cn(
                "flex-1 space-y-4 animate-fade-in",
                slideDirection === "left" ? "motion-safe:animate-fade-in" : "motion-safe:animate-fade-in"
              )}
            >
              {/* Step 1: Contact Details */}
              {currentStep === 1 && (
                <div className="space-y-4">
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
                    />
                  </div>

                  <div className="space-y-2" style={{ animationDelay: "100ms" }}>
                    <Label htmlFor="add-phone" className="flex items-center gap-2 text-sm font-medium">
                      <Phone className="w-4 h-4 text-accent" />
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-xl border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm font-medium">
                        +91
                      </span>
                      <Input
                        id="add-phone"
                        type="tel"
                        placeholder="9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="rounded-l-none rounded-r-xl h-11 text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Personal Details */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    <Label className="text-sm font-medium">Gender</Label>
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

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="w-4 h-4 text-accent" />
                      Date of Birth
                    </Label>
                    <DobInput value={dateOfBirth} onChange={setDateOfBirth} />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <IdCard className="w-4 h-4 text-accent" />
                      Photo ID Type
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

                  {photoIdType && (
                    <div className="space-y-2 animate-fade-in">
                      <Label className="text-sm font-medium">
                        {photoIdType === "aadhaar" ? "Aadhaar" : photoIdType === "pan" ? "PAN" : photoIdType === "voter" ? "Voter ID" : "DL"} Number
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

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="w-4 h-4 text-accent" />
                      Address
                    </Label>
                    <Input
                      placeholder="Enter address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="h-11 text-sm rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Package Selection */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  {/* Start Date */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="w-4 h-4 text-accent" />
                      Membership Start Date
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
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            return date < today;
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Duration */}
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
                            {pkg.months} {pkg.months === 1 ? "Month" : "Months"} - ₹{pkg.price} + ₹{pkg.joining_fee} joining
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Editable Fees */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <IndianRupee className="w-3 h-3" />
                        Monthly Fee
                      </Label>
                      <Input
                        type="number"
                        value={monthlyFee}
                        onChange={(e) => setMonthlyFee(Number(e.target.value) || 0)}
                        className="h-10 text-sm rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <IndianRupee className="w-3 h-3" />
                        Joining Fee
                      </Label>
                      <Input
                        type="number"
                        value={joiningFee}
                        onChange={(e) => setJoiningFee(Number(e.target.value) || 0)}
                        className="h-10 text-sm rounded-xl"
                      />
                    </div>
                  </div>

                  {/* PT Section */}
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Dumbbell className="w-4 h-4 text-muted-foreground" />
                        Personal Training
                      </span>
                      <Switch checked={wantsPT} onCheckedChange={setWantsPT} />
                    </div>

                    {wantsPT && trainers.length > 0 && (
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
                              value={ptFee}
                              onChange={(e) => setPtFee(Number(e.target.value) || 0)}
                              className="h-10 text-sm rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {wantsPT && trainers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No active trainers. Add them in settings.</p>
                    )}
                  </div>

                  {/* Price Summary */}
                  <div className="bg-muted/40 rounded-xl p-4 space-y-2.5 border border-border/40">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Membership ({selectedPackage?.months || 0}mo)</span>
                      <span className="font-semibold tabular-nums">₹{monthlyFee.toLocaleString("en-IN")}</span>
                    </div>
                    {joiningFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Joining Fee</span>
                        <span className="font-semibold tabular-nums">₹{joiningFee.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {wantsPT && (
                      <div className="flex justify-between text-sm animate-fade-in">
                        <span className="text-muted-foreground">PT ({ptMonths}mo)</span>
                        <span className="font-semibold tabular-nums">₹{ptFee.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-2.5 border-t border-border/60 text-base">
                      <span>Total (Cash)</span>
                      <span className="text-foreground tabular-nums">₹{totalAmount.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 py-4 mt-auto flex-shrink-0">
              {currentStep > 1 ? (
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
                  disabled={currentStep === 1 && !isStep1Valid}
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="flex-1 h-11 rounded-xl text-sm font-medium bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 shadow-sm"
                  disabled={isLoading || !isStep3Valid}
                >
                  {isLoading ? (
                    <>
                      <ButtonSpinner className="mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-1.5" />
                      Add Member
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
