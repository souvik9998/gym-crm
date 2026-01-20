import { useState, useEffect, useMemo } from "react";
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
  Phone, 
  Calendar, 
  Search, 
  Dumbbell, 
  IndianRupee,
  User,
  Clock,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { addMonths, differenceInDays, format, isBefore } from "date-fns";
import { useBranch } from "@/contexts/BranchContext";

interface Member {
  id: string;
  name: string;
  phone: string;
}

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

interface PTDurationOption {
  label: string;
  endDate: Date;
  days: number;
  fee: number;
  isValid: boolean;
}

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type PaymentType = "gym_only" | "gym_and_pt" | "pt_only";

export const AddPaymentDialog = ({ open, onOpenChange, onSuccess }: AddPaymentDialogProps) => {
  const { currentBranch } = useBranch();
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  
  // Payment type
  const [paymentType, setPaymentType] = useState<PaymentType>("gym_only");
  
  // Gym membership
  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [gymCustomAmount, setGymCustomAmount] = useState<string>("");
  
  // Personal Training
  const [trainers, setTrainers] = useState<PersonalTrainer[]>([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [selectedPTOption, setSelectedPTOption] = useState<PTDurationOption | null>(null);
  const [ptCustomAmount, setPtCustomAmount] = useState<string>("");
  
  // Member's current subscription end date (for PT duration calculation)
  const [membershipEndDate, setMembershipEndDate] = useState<Date | null>(null);
  const [gymEndDate, setGymEndDate] = useState<Date | null>(null);
  // Existing PT end date for calculating PT start date
  const [existingPTEndDate, setExistingPTEndDate] = useState<Date | null>(null);

  useEffect(() => {
    if (open && currentBranch) {
      fetchPackages();
      fetchTrainers();
      setMember(null);
      setPhone("");
      setPaymentType("gym_only");
      setSelectedPackageId("");
      setGymCustomAmount("");
      setSelectedTrainerId("");
      setSelectedPTOption(null);
      setPtCustomAmount("");
      setMembershipEndDate(null);
      setGymEndDate(null);
      setExistingPTEndDate(null);
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
    } else {
      setMonthlyPackages([]);
      setSelectedPackageId("");
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
    } else {
      setTrainers([]);
      setSelectedTrainerId("");
    }
  };

  const handleSearch = async () => {
    if (phone.length !== 10) {
      toast.error("Invalid Phone", {
        description: "Enter a valid 10-digit phone number",
      });
      return;
    }

    if (!currentBranch) {
      toast.error("Error", {
        description: "Please select a branch first",
      });
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone")
        .eq("phone", phone)
        .eq("branch_id", currentBranch.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setMember(data);
        // Fetch current membership end date for PT duration calculation
        fetchMembershipEndDate(data.id);
      } else {
        toast.error("Member Not Found", {
          description: "No member with this phone number exists in this branch",
        });
        setMember(null);
        setMembershipEndDate(null);
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const fetchMembershipEndDate = async (memberId: string) => {
    // Fetch gym membership end date
    const { data: gymData } = await supabase
      .from("subscriptions")
      .select("end_date")
      .eq("member_id", memberId)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gymData) {
      const endDate = new Date(gymData.end_date);
      endDate.setHours(23, 59, 59, 999);
      setMembershipEndDate(endDate);
    } else {
      setMembershipEndDate(null);
    }

    // Fetch existing PT end date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: ptData } = await supabase
      .from("pt_subscriptions")
      .select("end_date")
      .eq("member_id", memberId)
      .gte("end_date", today.toISOString().split("T")[0])
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ptData) {
      const ptEnd = new Date(ptData.end_date);
      ptEnd.setHours(23, 59, 59, 999);
      setExistingPTEndDate(ptEnd);
    } else {
      setExistingPTEndDate(null);
    }
  };

  const selectedPackage = monthlyPackages.find((p) => p.id === selectedPackageId);
  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);

  // Calculate gym membership end date when member or package changes
  useEffect(() => {
    const calculateGymEndDate = async () => {
      if (!member || !selectedPackage) {
        setGymEndDate(null);
        return;
      }

      const { data: currentSub } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isExpired = !currentSub || new Date(currentSub.end_date) < new Date();
      const startDate = isExpired ? new Date() : new Date(currentSub.end_date);
      if (!isExpired) startDate.setDate(startDate.getDate() + 1);

      const endDate = addMonths(startDate, selectedPackage.months);
      setGymEndDate(endDate);
    };

    calculateGymEndDate();
  }, [member, selectedPackage]);

  // Calculate PT start date: day after existing PT ends, or today if no active PT
  const ptStartDate = useMemo((): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (existingPTEndDate && existingPTEndDate >= today) {
      const nextDay = new Date(existingPTEndDate);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      return nextDay;
    }
    return today;
  }, [existingPTEndDate]);

  // Generate PT duration options (similar to ExtendPT.tsx and PackageSelectionForm.tsx)
  const ptDurationOptions = useMemo((): PTDurationOption[] => {
    if (!selectedTrainer || !member) return [];

    const options: PTDurationOption[] = [];
    const dailyRate = selectedTrainer.monthly_fee / 30;

    // Determine the membership end date constraint
    let membershipEndConstraint: Date | null = null;
    
    if (paymentType === "gym_and_pt") {
      // For gym_and_pt, use the new gym membership end date as constraint
      membershipEndConstraint = gymEndDate;
    } else if (paymentType === "pt_only") {
      // For pt_only, use existing membership end date
      membershipEndConstraint = membershipEndDate;
    }

    if (!membershipEndConstraint) {
      // For pt_only without active membership, return empty
      if (paymentType === "pt_only") {
        return [];
      }
      // For gym_and_pt, if gymEndDate is not calculated yet, return empty
      return [];
    }

    // Generate 1-month, 2-month, 3-month options starting from ptStartDate
    for (let months = 1; months <= 3; months++) {
      const optionEndDate = addMonths(ptStartDate, months);
      const isValid = isBefore(optionEndDate, membershipEndConstraint!) || optionEndDate.getTime() === membershipEndConstraint!.getTime();
      const days = differenceInDays(optionEndDate, ptStartDate);
      const fee = Math.ceil(dailyRate * days);

      options.push({
        label: `${months} Month${months > 1 ? "s" : ""}`,
        endDate: optionEndDate,
        days,
        fee,
        isValid,
      });
    }

    // Add "Till Membership End" option if different from existing options
    const daysToMembershipEnd = differenceInDays(membershipEndConstraint, ptStartDate);
    const existingMatchingOption = options.find(
      (opt) => opt.isValid && Math.abs(differenceInDays(opt.endDate, membershipEndConstraint!)) <= 1
    );

    if (!existingMatchingOption && daysToMembershipEnd > 0) {
      const fee = Math.ceil(dailyRate * daysToMembershipEnd);
      options.push({
        label: `Till Gym End (${format(membershipEndConstraint, "d MMM yyyy")})`,
        endDate: membershipEndConstraint,
        days: daysToMembershipEnd,
        fee,
        isValid: true,
      });
    }

    return options;
  }, [selectedTrainer, paymentType, membershipEndDate, gymEndDate, member, ptStartDate]);

  // Auto-select PT option when trainer or payment type changes
  useEffect(() => {
    if ((paymentType === "gym_and_pt" || paymentType === "pt_only") && ptDurationOptions.length > 0) {
      const firstValid = ptDurationOptions.find((opt) => opt.isValid);
      if (firstValid) {
        setSelectedPTOption(firstValid);
        // Set default PT fee
        setPtCustomAmount(firstValid.fee.toString());
      } else {
        setSelectedPTOption(null);
        setPtCustomAmount("");
      }
    } else {
      setSelectedPTOption(null);
      setPtCustomAmount("");
    }
  }, [selectedTrainer?.id, paymentType, ptDurationOptions]);

  // Update PT custom amount when PT option changes
  useEffect(() => {
    if (selectedPTOption && !ptCustomAmount) {
      setPtCustomAmount(selectedPTOption.fee.toString());
    }
  }, [selectedPTOption]);

  // Calculate amounts
  const gymAmount = paymentType === "pt_only" 
    ? 0 
    : (gymCustomAmount ? Number(gymCustomAmount) : (selectedPackage?.price || 0));
  
  const ptDefaultAmount = (paymentType === "gym_and_pt" || paymentType === "pt_only") && selectedPTOption
    ? selectedPTOption.fee
    : 0;
  
  const ptAmount = ptCustomAmount ? Number(ptCustomAmount) : ptDefaultAmount;
  
  const totalAmount = gymAmount + ptAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!member) {
      toast.error("No Member Selected", {
        description: "Search for a member first",
      });
      return;
    }

    if (paymentType !== "pt_only" && !selectedPackageId) {
      toast.error("Select Package", {
        description: "Please select a gym membership package",
      });
      return;
    }

    if ((paymentType === "gym_and_pt" || paymentType === "pt_only") && (!selectedTrainerId || !selectedPTOption)) {
      toast.error("Select Trainer", {
        description: "Please select a trainer and duration",
      });
      return;
    }

    setIsLoading(true);

    try {
      let subscriptionId: string | null = null;

      // Create/Extend gym subscription if needed
      if (paymentType !== "pt_only") {
      const { data: currentSub } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isExpired = !currentSub || new Date(currentSub.end_date) < new Date();
      const startDate = isExpired ? new Date() : new Date(currentSub.end_date);
      if (!isExpired) startDate.setDate(startDate.getDate() + 1);

        const endDate = addMonths(startDate, selectedPackage!.months);

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
            plan_months: selectedPackage!.months,
          status: "active",
        })
        .select()
        .single();

      if (subError) throw subError;
        subscriptionId = subscription.id;
      }

      // Create PT subscription if needed
      if (paymentType === "gym_and_pt" || paymentType === "pt_only") {
        const ptEndDate = new Date(selectedPTOption!.endDate);
        ptEndDate.setHours(23, 59, 59, 999);

        await supabase.from("pt_subscriptions").insert({
          member_id: member.id,
          personal_trainer_id: selectedTrainerId,
          start_date: ptStartDate.toISOString().split("T")[0],
          end_date: ptEndDate.toISOString().split("T")[0],
          monthly_fee: selectedTrainer!.monthly_fee,
          total_fee: ptAmount, // Use custom amount if provided, otherwise use calculated fee
          status: "active",
          branch_id: currentBranch?.id,
        });
      }

      // Create payment record
      const paymentTypeValue = paymentType === "gym_only" 
        ? "gym_membership" 
        : paymentType === "pt_only" 
        ? "pt_only" 
        : "gym_and_pt";

      const { data: paymentRecord, error: paymentError } = await supabase.from("payments").insert({
        member_id: member.id,
        subscription_id: subscriptionId,
        amount: totalAmount,
        payment_mode: "cash",
        status: "success",
        payment_type: paymentTypeValue,
        notes: `Cash payment via admin - ${paymentTypeValue}`,
        branch_id: currentBranch?.id,
      }).select().single();

      if (paymentError) throw paymentError;

      // Create ledger entries for cash payment
      try {
        // Gym renewal income entry (for gym_only and gym_and_pt)
        if (gymAmount > 0 && selectedPackage) {
          await createMembershipIncomeEntry(
            gymAmount,
            "gym_renewal",
            `Gym renewal - ${member.name} (${selectedPackage.months} months)`,
            member.id,
            undefined,
            paymentRecord.id,
            currentBranch?.id
          );
        }

        // PT subscription income entry (for gym_and_pt and pt_only)
        if (ptAmount > 0 && selectedTrainer) {
          await createMembershipIncomeEntry(
            ptAmount,
            "pt_subscription",
            `PT subscription - ${member.name} with ${selectedTrainer.name}`,
            member.id,
            undefined,
            paymentRecord.id,
            currentBranch?.id
          );

          // Calculate trainer percentage expense if applicable
          await calculateTrainerPercentageExpense(
            selectedTrainerId,
            ptAmount,
            member.id,
            undefined,
            undefined,
            member.name,
            currentBranch?.id
          );
        }
      } catch (ledgerError) {
        console.error("Error creating ledger entries:", ledgerError);
        // Don't throw - payment was successful, ledger is just for tracking
      }

      // Send WhatsApp notification
      try {
        const notificationType = paymentType === "pt_only" ? "pt_extension" : "renewal";
        const endDateForNotification = paymentType === "pt_only" 
          ? selectedPTOption!.endDate.toISOString().split("T")[0]
          : gymEndDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0];
        
        // Get current admin user
        const { data: { session } } = await supabase.auth.getSession();
        const adminUserId = session?.user?.id || null;

        await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone: member.phone,
            name: member.name,
            endDate: endDateForNotification,
            type: notificationType,
            memberIds: [member.id],
            isManual: true, // Admin manually adding payment
            adminUserId: adminUserId,
          },
        });
      } catch (err) {
        console.error("Failed to send WhatsApp notification:", err);
      }

      await logAdminActivity({
        category: "payments",
        type: "cash_payment_added",
        description: `Added cash payment of ₹${totalAmount} for ${member.name}`,
        entityType: "payments",
        entityName: member.name,
        newValue: { amount: totalAmount, payment_type: paymentTypeValue, member_name: member.name },
        branchId: currentBranch?.id,
      });

      toast.success("Payment recorded successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 flex-shrink-0 border-b">
          <DialogTitle>Record Cash Payment</DialogTitle>
          <DialogDescription>
            Add a cash payment for an existing member
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <form onSubmit={handleSubmit} className="space-y-5 pr-4">
          <div className="space-y-2">
            <Label htmlFor="search-phone" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-accent" />
              Find Member by Phone
            </Label>
            <div className="flex gap-2">
              <div className="flex flex-1">
                <span className="inline-flex items-center px-3 rounded-l-lg border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm">
                  +91
                </span>
                <Input
                  id="search-phone"
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="rounded-l-none"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSearch}
                disabled={isSearching}
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {member && (
            <>
              <div className="bg-success/10 border border-success/20 rounded-xl p-4">
                <p className="font-medium text-success">{member.name}</p>
                <p className="text-sm text-muted-foreground">+91 {member.phone}</p>
              </div>

                {/* Payment Type Selection */}
              <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" />
                    Payment Type
                </Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gym_only">Extend Gym Membership Only</SelectItem>
                      <SelectItem value="gym_and_pt">Extend Gym + PT</SelectItem>
                      <SelectItem value="pt_only">PT Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Gym Membership Section */}
                {paymentType !== "pt_only" && (
                  <div className="space-y-4 pt-2 border-t">
                    <h3 className="text-sm font-medium text-muted-foreground">Gym Membership</h3>
                    
                    <div className="space-y-2">
                      <Label>Select Package</Label>
                      <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select package" />
                        </SelectTrigger>
                        <SelectContent>
                          {monthlyPackages.map((pkg) => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                              {pkg.months} {pkg.months === 1 ? "Month" : "Months"} - ₹{pkg.price}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Display effective gym end date */}
                      {gymEndDate && (
                        <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-accent" />
                            <span className="text-muted-foreground">New gym membership ends:</span>
                            <span className="font-medium text-accent">{format(gymEndDate, "d MMMM yyyy")}</span>
                          </div>
                          {membershipEndDate && (
                            <p className="text-xs text-muted-foreground mt-1 ml-6">
                              Current ends: {format(membershipEndDate, "d MMM yyyy")}
                            </p>
                          )}
                        </div>
                      )}
              </div>

              <div className="space-y-2">
                      <Label htmlFor="gym-amount">Amount (₹)</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    ₹
                  </span>
                  <Input
                          id="gym-amount"
                    type="number"
                          value={gymCustomAmount || (selectedPackage?.price || 0)}
                          onChange={(e) => setGymCustomAmount(e.target.value)}
                    className="rounded-l-none"
                    min="0"
                  />
                </div>
                      {!gymCustomAmount && selectedPackage && (
                  <p className="text-xs text-muted-foreground">
                          Default: ₹{selectedPackage.price.toLocaleString("en-IN")} ({selectedPackage.months} {selectedPackage.months === 1 ? "month" : "months"})
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Personal Training Section */}
                {(paymentType === "gym_and_pt" || paymentType === "pt_only") && (
                  <div className="space-y-4 pt-2 border-t">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Dumbbell className="w-4 h-4" />
                      Personal Training
                    </h3>

                    {paymentType === "pt_only" && !membershipEndDate && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="w-4 h-4" />
                          <p className="text-sm font-medium">
                            Member needs an active gym membership to add PT
                          </p>
                        </div>
                      </div>
                    )}

                    {trainers.length > 0 && (
                      <>
                        <div className="space-y-2">
                          <Label>Select Trainer</Label>
                          <Select value={selectedTrainerId} onValueChange={setSelectedTrainerId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose trainer" />
                            </SelectTrigger>
                            <SelectContent>
                              {trainers.map((trainer) => (
                                <SelectItem key={trainer.id} value={trainer.id}>
                                  {trainer.name} - ₹{trainer.monthly_fee}/month
                                  {trainer.specialization && ` (${trainer.specialization})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedTrainer && ptDurationOptions.length > 0 && (
                          <>
                            <div className="space-y-2">
                              <Label>PT Duration</Label>
                              {/* Show existing PT and gym membership info */}
                              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                                {existingPTEndDate && (
                                  <p className="text-xs text-muted-foreground">
                                    Current PT ends: <span className="font-medium">{format(existingPTEndDate, "d MMM yyyy")}</span>
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  PT starts: <span className="font-medium text-accent">{format(ptStartDate, "d MMM yyyy")}</span>
                                </p>
                                {(paymentType === "pt_only" && membershipEndDate) || (paymentType === "gym_and_pt" && gymEndDate) ? (
                                  <p className="text-xs text-muted-foreground">
                                    Gym membership ends: <span className="font-medium">
                                      {paymentType === "gym_and_pt" 
                                        ? format(gymEndDate!, "d MMM yyyy")
                                        : format(membershipEndDate!, "d MMM yyyy")
                                      }
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                              <div className="space-y-2">
                                {ptDurationOptions.map((option, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      if (option.isValid) {
                                        setSelectedPTOption(option);
                                        setPtCustomAmount(option.fee.toString());
                                      }
                                    }}
                                    disabled={!option.isValid}
                                    className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                                      !option.isValid
                                        ? "border-border/50 bg-muted/30 opacity-50 cursor-not-allowed"
                                        : selectedPTOption?.label === option.label
                                        ? "border-accent bg-accent/10"
                                        : "border-border hover:border-accent/50 bg-card"
                                    }`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium text-sm">{option.label}</p>
                                          {!option.isValid && (
                                            <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
                                              Exceeds membership
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                          <Clock className="w-3 h-3" />
                                          {option.days} days • Ends {format(option.endDate, "d MMM yyyy")}
                                        </p>
                                      </div>
                                      <span className="font-bold text-accent flex items-center text-sm">
                                        <IndianRupee className="w-3 h-3" />
                                        {option.fee.toLocaleString("en-IN")}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="pt-amount">PT Fee (₹)</Label>
                              <div className="flex">
                                <span className="inline-flex items-center px-3 rounded-l-lg border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm">
                                  ₹
                                </span>
                                <Input
                                  id="pt-amount"
                                  type="number"
                                  value={ptCustomAmount || (selectedPTOption?.fee || 0)}
                                  onChange={(e) => setPtCustomAmount(e.target.value)}
                                  className="rounded-l-none"
                                  min="0"
                                />
                              </div>
                              {selectedPTOption && !ptCustomAmount && (
                                <p className="text-xs text-muted-foreground">
                                  Default: ₹{selectedPTOption.fee.toLocaleString("en-IN")} ({selectedPTOption.days} days)
                                </p>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {trainers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No active trainers available</p>
                    )}
                  </div>
                )}

                {/* Price Summary */}
                <div className="bg-muted rounded-xl p-4 space-y-2">
                  {paymentType !== "pt_only" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gym Membership</span>
                      <span>₹{gymAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {(paymentType === "gym_and_pt" || paymentType === "pt_only") && selectedPTOption && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Personal Training ({selectedPTOption.days} days)
                      </span>
                      <span>₹{ptAmount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t border-border">
                    <span>Total (Cash)</span>
                    <span className="text-accent">₹{totalAmount.toLocaleString("en-IN")}</span>
                  </div>
              </div>
            </>
          )}

            <div className="flex gap-3 pb-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              className="flex-1"
                disabled={isLoading || !member || totalAmount === 0}
            >
              {isLoading ? "Recording..." : "Record Payment"}
            </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
