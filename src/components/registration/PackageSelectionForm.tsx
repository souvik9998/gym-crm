import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Calendar, IndianRupee, Sparkles, User, Dumbbell, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { addDays, addMonths, differenceInDays, format, isBefore } from "date-fns";

interface Trainer {
  id: string;
  name: string;
  specialization: string | null;
  monthly_fee: number;
}

interface CustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
}

interface MonthlyPackage {
  id: string;
  months: number;
  price: number;
  joining_fee: number;
}

interface PTDurationOption {
  label: string;
  endDate: Date;
  days: number;
  fee: number;
  isValid: boolean;
}

interface PackageSelectionFormProps {
  isNewMember: boolean;
  memberName: string;
  onSubmit: (data: PackageSelectionData) => void;
  onBack: () => void;
  isLoading: boolean;
  ptStartDate?: string; // For existing members with active PT, this is end_date + 1
  existingMembershipEndDate?: string; // For renewals - the current gym membership end date
  existingPTEndDate?: string; // For renewals - the current PT end date (if any)
}

export interface PackageSelectionData {
  selectedMonths: number;
  selectedTrainer: Trainer | null;
  wantsTrainer: boolean;
  isCustomPackage: boolean;
  customPackage: CustomPackage | null;
  totalAmount: number;
  subscriptionAmount: number;
  joiningFee: number;
  trainerFee: number;
  ptDays?: number;
  ptEndDate?: string;
}

const PackageSelectionForm = ({ 
  isNewMember, 
  memberName, 
  onSubmit, 
  onBack,
  isLoading,
  ptStartDate,
  existingMembershipEndDate,
  existingPTEndDate 
}: PackageSelectionFormProps) => {
  const [packageType, setPackageType] = useState<"monthly" | "custom">("monthly");
  const [selectedMonthlyPackage, setSelectedMonthlyPackage] = useState<MonthlyPackage | null>(null);
  const [selectedCustomPackage, setSelectedCustomPackage] = useState<CustomPackage | null>(null);
  const [wantsTrainer, setWantsTrainer] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedPTOption, setSelectedPTOption] = useState<PTDurationOption | null>(null);

  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [customPackages, setCustomPackages] = useState<CustomPackage[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Fetch monthly packages with custom pricing
    const { data: monthlyData } = await supabase
      .from("monthly_packages")
      .select("*")
      .eq("is_active", true)
      .order("months");

    if (monthlyData && monthlyData.length > 0) {
      setMonthlyPackages(monthlyData);
      // Set default selection to 3 months if available, otherwise first
      const defaultPkg = monthlyData.find((p) => p.months === 3) || monthlyData[0];
      setSelectedMonthlyPackage(defaultPkg);
    }

    // Fetch trainers
    const { data: trainersData } = await supabase
      .from("personal_trainers")
      .select("id, name, specialization, monthly_fee")
      .eq("is_active", true);

    if (trainersData) {
      setTrainers(trainersData);
    }

    // Fetch custom packages
    const { data: packagesData } = await supabase
      .from("custom_packages")
      .select("*")
      .eq("is_active", true)
      .order("duration_days");

    if (packagesData) {
      setCustomPackages(packagesData);
    }
  };

  // Calculate membership end date based on selection
  const membershipEndDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (packageType === "custom" && selectedCustomPackage) {
      return addDays(today, selectedCustomPackage.duration_days);
    } else if (selectedMonthlyPackage) {
      return addMonths(today, selectedMonthlyPackage.months);
    }
    return today;
  }, [packageType, selectedMonthlyPackage, selectedCustomPackage]);

  // Generate dynamic PT duration options based on membership end date and PT start date
  const ptDurationOptions = useMemo((): PTDurationOption[] => {
    if (!selectedTrainer) return [];

    // Determine PT start date: use provided ptStartDate (for renewals with active PT) or today
    const ptStart = ptStartDate ? new Date(ptStartDate) : new Date();
    ptStart.setHours(0, 0, 0, 0);
    
    const options: PTDurationOption[] = [];
    const dailyRate = selectedTrainer.monthly_fee / 30;

    // For custom (daily) packages, only offer PT for the same duration
    if (packageType === "custom" && selectedCustomPackage) {
      const days = selectedCustomPackage.duration_days;
      const fee = Math.ceil(dailyRate * days);
      const ptEndDate = addDays(ptStart, days);
      const isValid = isBefore(ptEndDate, membershipEndDate) || ptEndDate.getTime() === membershipEndDate.getTime();
      
      if (isValid) {
        options.push({
          label: `${days} Day${days > 1 ? "s" : ""} (Full Package)`,
          endDate: ptEndDate,
          days,
          fee,
          isValid: true,
        });
      }
      return options;
    }

    // For monthly packages, generate options from PT start date
    if (selectedMonthlyPackage) {
      // Calculate max days available from PT start to membership end
      const maxDaysAvailable = differenceInDays(membershipEndDate, ptStart);
      
      if (maxDaysAvailable <= 0) {
        // No PT available - PT start is beyond membership end
        return [];
      }

      // Generate month-based options
      for (let months = 1; months <= 12; months++) {
        const optionEndDate = addMonths(ptStart, months);
        const isValid = isBefore(optionEndDate, membershipEndDate) || optionEndDate.getTime() === membershipEndDate.getTime();
        
        if (!isValid && months > 1) break; // Stop if we've exceeded membership end
        
        const days = differenceInDays(optionEndDate, ptStart);
        const fee = Math.ceil(dailyRate * days);

        options.push({
          label: `${months} Month${months > 1 ? "s" : ""}`,
          endDate: optionEndDate,
          days,
          fee,
          isValid,
        });
        
        if (!isValid) break; // Stop after adding the first invalid option
      }

      // Add "Till Membership End" option if different from last valid option
      const daysToMembershipEnd = differenceInDays(membershipEndDate, ptStart);
      const lastValidOption = options.filter(o => o.isValid).pop();
      
      if (lastValidOption && Math.abs(differenceInDays(lastValidOption.endDate, membershipEndDate)) > 1) {
        const fee = Math.ceil(dailyRate * daysToMembershipEnd);
        options.push({
          label: `Till ${format(membershipEndDate, "d MMM yyyy")}`,
          endDate: membershipEndDate,
          days: daysToMembershipEnd,
          fee,
          isValid: true,
        });
      }
    }

    return options;
  }, [selectedTrainer, packageType, selectedMonthlyPackage, selectedCustomPackage, membershipEndDate, ptStartDate]);

  // Auto-select PT option when trainer is selected or options change
  useEffect(() => {
    if (wantsTrainer && ptDurationOptions.length > 0) {
      // Default to matching gym membership duration
      const matchingOption = ptDurationOptions.find(
        (opt) => opt.isValid && opt.days === differenceInDays(membershipEndDate, new Date())
      );
      setSelectedPTOption(matchingOption || ptDurationOptions.find((opt) => opt.isValid) || null);
    } else {
      setSelectedPTOption(null);
    }
  }, [wantsTrainer, ptDurationOptions, membershipEndDate]);

  // Calculate amounts
  const isCustom = packageType === "custom" && selectedCustomPackage;
  
  // For daily passes, no joining fee
  const joiningFee = isCustom 
    ? 0 
    : (isNewMember && selectedMonthlyPackage ? Number(selectedMonthlyPackage.joining_fee) : 0);
  
  const subscriptionAmount = isCustom 
    ? selectedCustomPackage!.price 
    : (selectedMonthlyPackage?.price || 0);
  
  const trainerFee = wantsTrainer && selectedTrainer && selectedPTOption 
    ? selectedPTOption.fee 
    : 0;
  
  const totalAmount = subscriptionAmount + joiningFee + trainerFee;

  const handleSubmit = () => {
    onSubmit({
      selectedMonths: isCustom ? 0 : (selectedMonthlyPackage?.months || 0),
      selectedTrainer: wantsTrainer ? selectedTrainer : null,
      wantsTrainer,
      isCustomPackage: !!isCustom,
      customPackage: isCustom ? selectedCustomPackage : null,
      totalAmount,
      subscriptionAmount,
      joiningFee,
      trainerFee,
      ptDays: wantsTrainer && selectedPTOption ? selectedPTOption.days : undefined,
      ptEndDate: wantsTrainer && selectedPTOption ? format(selectedPTOption.endDate, "yyyy-MM-dd") : undefined,
    });
  };
  // Parse existing dates for display
  const parsedExistingMembershipEndDate = existingMembershipEndDate ? new Date(existingMembershipEndDate) : null;
  const parsedExistingPTEndDate = existingPTEndDate ? new Date(existingPTEndDate) : null;
  const parsedPtStartDate = ptStartDate ? new Date(ptStartDate) : null;

  return (
    <Card className="max-w-md mx-auto border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Select Your Plan</CardTitle>
        <CardDescription>
          {isNewMember ? "Welcome" : "Welcome back"}, {memberName}! Choose your membership plan
        </CardDescription>
        
        {/* Show existing membership info for renewals */}
        {!isNewMember && parsedExistingMembershipEndDate && (
          <div className="space-y-2 mt-3">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Current gym membership ends:{" "}
                <span className="font-semibold text-foreground">
                  {format(parsedExistingMembershipEndDate, "d MMMM yyyy")}
                </span>
              </span>
            </div>
            {parsedExistingPTEndDate && (
              <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20">
                <Dumbbell className="w-4 h-4 text-accent" />
                <span className="text-sm text-muted-foreground">
                  Current PT ends:{" "}
                  <span className="font-semibold text-accent">
                    {format(parsedExistingPTEndDate, "d MMMM yyyy")}
                  </span>
                  {parsedPtStartDate && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (New PT starts {format(parsedPtStartDate, "d MMM yyyy")})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Package Type Selection */}
        <Tabs value={packageType} onValueChange={(v) => setPackageType(v as "monthly" | "custom")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly" className="gap-2">
              <Calendar className="w-4 h-4" />
              Monthly
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Daily Pass
            </TabsTrigger>
          </TabsList>

          {/* Monthly Packages */}
          <TabsContent value="monthly" className="mt-4">
            {monthlyPackages.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                No monthly packages available
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {monthlyPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedMonthlyPackage(pkg)}
                    className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                      selectedMonthlyPackage?.id === pkg.id
                        ? "border-accent bg-accent/10 shadow-lg"
                        : "border-border hover:border-accent/50 bg-card"
                    }`}
                  >
                    {pkg.months === 3 && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Popular
                      </span>
                    )}
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-foreground">{pkg.months}</div>
                      <div className="text-sm text-muted-foreground">
                        {pkg.months === 1 ? "Month" : "Months"}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-accent flex items-center justify-center">
                        <IndianRupee className="w-3 h-3" />
                        {Number(pkg.price).toLocaleString("en-IN")}
                      </div>
                      {selectedMonthlyPackage?.id === pkg.id && (
                        <div className="mt-2 flex justify-center">
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <Check className="w-3 h-3 text-accent-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Custom/Daily Packages */}
          <TabsContent value="custom" className="mt-4">
            {customPackages.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">
                No daily passes available
              </p>
            ) : (
              <div className="space-y-3">
                {customPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedCustomPackage(pkg)}
                    className={`w-full p-4 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${
                      selectedCustomPackage?.id === pkg.id
                        ? "border-accent bg-accent/10 shadow-lg"
                        : "border-border hover:border-accent/50 bg-card"
                    }`}
                  >
                    <div className="text-left">
                      <p className="font-semibold">{pkg.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {pkg.duration_days} {pkg.duration_days === 1 ? "Day" : "Days"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-accent flex items-center">
                        <IndianRupee className="w-4 h-4" />
                        {pkg.price}
                      </span>
                      {selectedCustomPackage?.id === pkg.id && (
                        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-3 h-3 text-accent-foreground" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Personal Trainer Selection */}
        {trainers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <Dumbbell className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">Personal Trainer</p>
                  <p className="text-sm text-muted-foreground">Get personalized training</p>
                </div>
              </div>
              <Switch checked={wantsTrainer} onCheckedChange={setWantsTrainer} />
            </div>

            {wantsTrainer && (
              <div className="space-y-4 pl-2">
                {/* Trainer Selection */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Select Trainer</h4>
                  {trainers.map((trainer) => (
                    <button
                      key={trainer.id}
                      onClick={() => setSelectedTrainer(trainer)}
                      className={`w-full p-4 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${
                        selectedTrainer?.id === trainer.id
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/50 bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">{trainer.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {trainer.specialization || "General Training"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-accent flex items-center">
                          <IndianRupee className="w-4 h-4" />
                          {trainer.monthly_fee}
                        </p>
                        <p className="text-xs text-muted-foreground">/month</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* PT Duration Selection */}
                {selectedTrainer && ptDurationOptions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">PT Duration</h4>
                    <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Gym membership ends:{" "}
                        <span className="font-medium text-foreground">
                          {format(membershipEndDate, "d MMM yyyy")}
                        </span>
                      </span>
                    </div>
                    <div className="space-y-2">
                      {ptDurationOptions.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => option.isValid && setSelectedPTOption(option)}
                          disabled={!option.isValid}
                          className={`w-full p-3 rounded-xl border-2 transition-all duration-200 ${
                            !option.isValid
                              ? "border-border/50 bg-muted/30 opacity-50 cursor-not-allowed"
                              : selectedPTOption?.label === option.label
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-accent/50 bg-card"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{option.label}</p>
                                {!option.isValid && (
                                  <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
                                    Exceeds membership
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                {option.days} days • Ends {format(option.endDate, "d MMM")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-accent flex items-center text-sm">
                                <IndianRupee className="w-3 h-3" />
                                {option.fee.toLocaleString("en-IN")}
                              </span>
                              {option.isValid && selectedPTOption?.label === option.label && (
                                <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-accent-foreground" />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Price Breakdown */}
        <div className="bg-muted rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {isCustom 
                ? selectedCustomPackage?.name 
                : `Subscription (${selectedMonthlyPackage?.months || 0} mo)`
              }
            </span>
            <span className="font-semibold flex items-center">
              <IndianRupee className="w-4 h-4" />
              {subscriptionAmount.toLocaleString("en-IN")}
            </span>
          </div>

          {isNewMember && joiningFee > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Joining Fee
              </span>
              <span className="font-semibold flex items-center">
                <IndianRupee className="w-4 h-4" />
                {joiningFee.toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {wantsTrainer && selectedTrainer && selectedPTOption && trainerFee > 0 && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Dumbbell className="w-4 h-4" />
                  {selectedTrainer.name} ({selectedPTOption.days}d)
                </span>
                <span className="font-semibold flex items-center">
                  <IndianRupee className="w-4 h-4" />
                  {trainerFee.toLocaleString("en-IN")}
                </span>
              </div>
              {parsedPtStartDate && (
                <div className="text-xs text-muted-foreground">
                  PT: {format(parsedPtStartDate, "d MMM yyyy")} → {format(selectedPTOption.endDate, "d MMM yyyy")}
                </div>
              )}
            </>
          )}

          <div className="border-t border-border pt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">Total</span>
              <span className="text-2xl font-semibold text-accent flex items-center">
                <IndianRupee className="w-5 h-5" />
                {totalAmount.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button
            variant="accent"
            size="lg"
            className="flex-1"
            onClick={handleSubmit}
            disabled={isLoading || (packageType === "monthly" && !selectedMonthlyPackage) || (packageType === "custom" && !selectedCustomPackage) || (wantsTrainer && !selectedTrainer)}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                Processing...
              </div>
            ) : (
              <>Pay ₹{totalAmount.toLocaleString("en-IN")}</>
            )}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Secure payment powered by Razorpay
        </p>
      </CardContent>
    </Card>
  );
};

export default PackageSelectionForm;
