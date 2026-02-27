import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Calendar, IndianRupee, Sparkles, User, Dumbbell, Clock, AlertCircle, CalendarDays, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { addDays, addMonths, differenceInDays, format, isBefore } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
  fetchPublicPackages, 
  fetchPublicTrainers, 
  type PublicMonthlyPackage,
  type PublicCustomPackage,
  type PublicTrainer 
} from "@/api/publicData";

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
  ptStartDate?: string;
  existingMembershipEndDate?: string;
  existingPTEndDate?: string;
  minStartDate?: Date;
  branchId?: string;
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
  startDate?: string;
  ptStartDate?: string;
}

// Skeleton for loading state
const PackageSkeleton = () => (
  <div className="grid grid-cols-2 gap-3">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="p-4 rounded-xl border-2 border-border">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-10" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    ))}
  </div>
);

const TrainerSkeleton = () => (
  <div className="space-y-3">
    {[1, 2].map((i) => (
      <div key={i} className="p-4 rounded-xl border-2 border-border flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-5 w-14" />
      </div>
    ))}
  </div>
);

const PackageSelectionForm = ({ 
  isNewMember, 
  memberName, 
  onSubmit, 
  onBack,
  isLoading,
  ptStartDate: propPtStartDate,
  existingMembershipEndDate,
  existingPTEndDate,
  minStartDate: propMinStartDate,
  branchId
}: PackageSelectionFormProps) => {
  const [packageType, setPackageType] = useState<"monthly" | "custom">("monthly");
  const [selectedMonthlyPackage, setSelectedMonthlyPackage] = useState<MonthlyPackage | null>(null);
  const [selectedCustomPackage, setSelectedCustomPackage] = useState<CustomPackage | null>(null);
  const [wantsTrainer, setWantsTrainer] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedPTOption, setSelectedPTOption] = useState<PTDurationOption | null>(null);
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [customPackages, setCustomPackages] = useState<CustomPackage[]>([]);
  
  const isExpiredMembership = useMemo(() => {
    if (!existingMembershipEndDate) return false;
    const endDate = new Date(existingMembershipEndDate);
    endDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return endDate < today;
  }, [existingMembershipEndDate]);
  
  const minStartDate = useMemo(() => {
    if (propMinStartDate) return propMinStartDate;
    if (existingMembershipEndDate) {
      const endDate = new Date(existingMembershipEndDate);
      endDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (endDate < today) return addDays(endDate, 1);
      return addDays(endDate, 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [existingMembershipEndDate, propMinStartDate]);
  
  const [selectedStartDate, setSelectedStartDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (propMinStartDate) return propMinStartDate;
    return today;
  });
  
  useEffect(() => {
    if (!isExpiredMembership && selectedStartDate < minStartDate) {
      setSelectedStartDate(minStartDate);
    }
  }, [minStartDate, isExpiredMembership]);

  useEffect(() => {
    fetchData();
  }, [branchId]);

  const [fetchError, setFetchError] = useState(false);

  const fetchData = async () => {
    setIsDataLoading(true);
    setFetchError(false);

    const cacheKey = `packages-trainers-${branchId || "all"}`;

    // Try loading from sessionStorage cache first for instant display
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { packages, trainers: cachedTrainers, custom, ts } = JSON.parse(cached);
        // Use cache if less than 5 minutes old
        if (Date.now() - ts < 5 * 60 * 1000) {
          if (packages?.length > 0) {
            setMonthlyPackages(packages);
            const defaultPkg = packages.find((p: any) => p.months === 3) || packages[0];
            setSelectedMonthlyPackage(defaultPkg);
          }
          if (cachedTrainers?.length > 0) setTrainers(cachedTrainers);
          if (custom?.length > 0) setCustomPackages(custom);
          setIsDataLoading(false);
          // Still refresh in background
          refreshInBackground(cacheKey);
          return;
        }
      }
    } catch { /* ignore cache errors */ }

    // No cache — fetch fresh
    try {
      await fetchFresh(cacheKey);
    } catch (error) {
      console.error("Error fetching registration data:", error);
      setFetchError(true);
    } finally {
      setIsDataLoading(false);
    }
  };

  const fetchFresh = async (cacheKey: string) => {
    const [packagesResult, trainersResult] = await Promise.all([
      fetchPublicPackages(branchId),
      fetchPublicTrainers(branchId),
    ]);

    const mappedTrainers = trainersResult.map(t => ({
      id: t.id,
      name: t.name,
      specialization: null as string | null,
      monthly_fee: t.monthly_fee,
    }));

    if (packagesResult.monthlyPackages.length > 0) {
      setMonthlyPackages(packagesResult.monthlyPackages);
      const defaultPkg = packagesResult.monthlyPackages.find((p) => p.months === 3) || packagesResult.monthlyPackages[0];
      setSelectedMonthlyPackage(defaultPkg);
    }
    if (mappedTrainers.length > 0) setTrainers(mappedTrainers);
    if (packagesResult.customPackages.length > 0) setCustomPackages(packagesResult.customPackages);

    // Cache for next visit
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        packages: packagesResult.monthlyPackages,
        trainers: mappedTrainers,
        custom: packagesResult.customPackages,
        ts: Date.now(),
      }));
    } catch { /* ignore */ }
  };

  const refreshInBackground = (cacheKey: string) => {
    Promise.all([
      fetchPublicPackages(branchId),
      fetchPublicTrainers(branchId),
    ]).then(([packagesResult, trainersResult]) => {
      const mappedTrainers = trainersResult.map(t => ({
        id: t.id, name: t.name, specialization: null as string | null, monthly_fee: t.monthly_fee,
      }));
      if (packagesResult.monthlyPackages.length > 0) setMonthlyPackages(packagesResult.monthlyPackages);
      if (mappedTrainers.length > 0) setTrainers(mappedTrainers);
      if (packagesResult.customPackages.length > 0) setCustomPackages(packagesResult.customPackages);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          packages: packagesResult.monthlyPackages, trainers: mappedTrainers,
          custom: packagesResult.customPackages, ts: Date.now(),
        }));
      } catch { /* ignore */ }
    }).catch(() => { /* silent background refresh */ });
  };

  // Calculate membership end date
  const membershipEndDate = useMemo(() => {
    const startDate = new Date(selectedStartDate);
    startDate.setHours(0, 0, 0, 0);
    if (packageType === "custom" && selectedCustomPackage) {
      return addDays(startDate, selectedCustomPackage.duration_days);
    } else if (selectedMonthlyPackage) {
      return addMonths(startDate, selectedMonthlyPackage.months);
    }
    return startDate;
  }, [packageType, selectedMonthlyPackage, selectedCustomPackage, selectedStartDate]);

  const ptStartDate = useMemo(() => {
    if (propPtStartDate) {
      const ptStart = new Date(propPtStartDate);
      ptStart.setHours(0, 0, 0, 0);
      return ptStart;
    }
    const start = new Date(selectedStartDate);
    start.setHours(0, 0, 0, 0);
    return start;
  }, [propPtStartDate, selectedStartDate]);

  const ptDurationOptions = useMemo((): PTDurationOption[] => {
    if (!selectedTrainer) return [];
    const ptStart = new Date(ptStartDate);
    ptStart.setHours(0, 0, 0, 0);
    const options: PTDurationOption[] = [];
    const dailyRate = selectedTrainer.monthly_fee / 30;

    if (packageType === "custom" && selectedCustomPackage) {
      const days = selectedCustomPackage.duration_days;
      const fee = Math.ceil(dailyRate * days);
      const ptEndDate = addDays(ptStart, days);
      const isValid = isBefore(ptEndDate, membershipEndDate) || ptEndDate.getTime() === membershipEndDate.getTime();
      if (isValid) {
        options.push({ label: `${days} Day${days > 1 ? "s" : ""} (Full Package)`, endDate: ptEndDate, days, fee, isValid: true });
      }
      return options;
    }

    if (selectedMonthlyPackage) {
      const maxDaysAvailable = differenceInDays(membershipEndDate, ptStart);
      if (maxDaysAvailable <= 0) return [];

      for (let months = 1; months <= 12; months++) {
        const optionEndDate = addMonths(ptStart, months);
        const isValid = isBefore(optionEndDate, membershipEndDate) || optionEndDate.getTime() === membershipEndDate.getTime();
        if (!isValid && months > 1) break;
        const days = differenceInDays(optionEndDate, ptStart);
        const fee = Math.ceil(dailyRate * days);
        options.push({ label: `${months} Month${months > 1 ? "s" : ""}`, endDate: optionEndDate, days, fee, isValid });
        if (!isValid) break;
      }

      const daysToMembershipEnd = differenceInDays(membershipEndDate, ptStart);
      if (daysToMembershipEnd > 0) {
        const lastValidOption = options.filter(o => o.isValid).pop();
        const existsDifferentOption = lastValidOption && Math.abs(differenceInDays(lastValidOption.endDate, membershipEndDate)) > 1;
        if (!lastValidOption || existsDifferentOption) {
          const fee = Math.ceil(dailyRate * daysToMembershipEnd);
          options.push({ label: `Until Gym End Date (${format(membershipEndDate, "d MMM yyyy")})`, endDate: membershipEndDate, days: daysToMembershipEnd, fee, isValid: true });
        }
      }
    }

    return options;
  }, [selectedTrainer, packageType, selectedMonthlyPackage, selectedCustomPackage, membershipEndDate, ptStartDate]);

  // Auto-select PT option
  useEffect(() => {
    if (wantsTrainer && ptDurationOptions.length > 0) {
      const matchingOption = ptDurationOptions.find(
        (opt) => opt.isValid && opt.days === differenceInDays(membershipEndDate, new Date())
      );
      setSelectedPTOption(matchingOption || ptDurationOptions.find((opt) => opt.isValid) || null);
    } else {
      setSelectedPTOption(null);
    }
  }, [wantsTrainer, ptDurationOptions, membershipEndDate]);

  // Auto-select first trainer when trainer toggle is turned on
  useEffect(() => {
    if (wantsTrainer && trainers.length > 0 && !selectedTrainer) {
      setSelectedTrainer(trainers[0]);
    }
  }, [wantsTrainer, trainers, selectedTrainer]);

  const isCustom = packageType === "custom" && selectedCustomPackage;
  const joiningFee = isCustom ? 0 : (isNewMember && selectedMonthlyPackage ? Number(selectedMonthlyPackage.joining_fee) : 0);
  const subscriptionAmount = isCustom ? selectedCustomPackage!.price : (selectedMonthlyPackage?.price || 0);
  const trainerFee = wantsTrainer && selectedTrainer && selectedPTOption ? selectedPTOption.fee : 0;
  const totalAmount = subscriptionAmount + joiningFee + trainerFee;

  const parsedExistingMembershipEndDate = existingMembershipEndDate ? new Date(existingMembershipEndDate) : null;
  const parsedExistingPTEndDate = existingPTEndDate ? new Date(existingPTEndDate) : null;

  const hasActiveMembership = useMemo(() => {
    if (!parsedExistingMembershipEndDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsedExistingMembershipEndDate > today;
  }, [parsedExistingMembershipEndDate]);

  useEffect(() => {
    if (hasActiveMembership && packageType === "custom") {
      setPackageType("monthly");
      setSelectedCustomPackage(null);
    }
  }, [hasActiveMembership, packageType]);

  const handleSubmit = () => {
    if (hasActiveMembership && isCustom) return;
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
      startDate: format(selectedStartDate, "yyyy-MM-dd"),
      ptStartDate: wantsTrainer ? format(ptStartDate, "yyyy-MM-dd") : undefined,
    });
  };

  return (
    <Card className="max-w-md mx-auto border animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Select Your Plan</CardTitle>
        <CardDescription>
          {isNewMember ? "Welcome" : "Welcome back"}, {memberName}! Choose your membership plan
        </CardDescription>
        
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
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Start Date Selection */}
        <div className="space-y-2 animate-fade-in" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Membership Start Date
            </span>
          </div>
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full p-3 rounded-lg border-2 border-border hover:border-accent/50 bg-card flex items-center justify-between transition-all duration-200"
              >
                <span className="font-medium">{format(selectedStartDate, "d MMMM yyyy")}</span>
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={selectedStartDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedStartDate(date);
                    setShowDatePicker(false);
                  }
                }}
                disabled={(date) => {
                  const dateNormalized = new Date(date);
                  dateNormalized.setHours(0, 0, 0, 0);
                  const minNormalized = new Date(minStartDate);
                  minNormalized.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (isExpiredMembership) {
                    return dateNormalized < minNormalized || dateNormalized > today;
                  }
                  return dateNormalized < minNormalized;
                }}
                fromMonth={isExpiredMembership ? minStartDate : undefined}
                toMonth={isExpiredMembership ? new Date() : undefined}
                defaultMonth={selectedStartDate}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            {hasActiveMembership 
              ? `Minimum start date: ${format(minStartDate, "d MMM yyyy")} (day after current membership ends)`
              : isExpiredMembership
                ? `Select any date from ${format(minStartDate, "d MMM yyyy")} to today`
                : "Select when your membership should begin"}
          </p>
        </div>

        {/* Package Type Selection */}
        <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
          <Tabs value={packageType} onValueChange={(v) => {
            if (v === "custom" && hasActiveMembership) return;
            setPackageType(v as "monthly" | "custom");
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="monthly" className="gap-2">
                <Calendar className="w-4 h-4" />
                Monthly
              </TabsTrigger>
              <TabsTrigger 
                value="custom" 
                className={hasActiveMembership ? "gap-2 opacity-50 cursor-not-allowed" : "gap-2"}
                disabled={hasActiveMembership}
              >
                <Sparkles className="w-4 h-4" />
                Daily Pass
              </TabsTrigger>
            </TabsList>

            {/* Monthly Packages */}
            <TabsContent value="monthly" className="mt-4">
              {isDataLoading ? (
                <PackageSkeleton />
              ) : fetchError || monthlyPackages.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-muted-foreground">
                    {fetchError ? "Failed to load packages" : "No monthly packages available"}
                  </p>
                  {fetchError && (
                    <Button variant="outline" size="sm" onClick={fetchData}>
                      <RefreshCw className="w-4 h-4 mr-1" /> Retry
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {monthlyPackages.map((pkg, idx) => {
                    const pkgStartDate = new Date(selectedStartDate);
                    pkgStartDate.setHours(0, 0, 0, 0);
                    const pkgEndDate = addMonths(pkgStartDate, pkg.months);
                    const isSelected = selectedMonthlyPackage?.id === pkg.id;
                    const isPopular = pkg.months === 3;
                    
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedMonthlyPackage(pkg)}
                        className={cn(
                          "relative p-4 rounded-xl border-2 transition-all duration-300 animate-fade-in",
                          isSelected
                            ? "border-accent bg-accent/10 shadow-lg scale-[1.02]"
                            : "border-border hover:border-accent/50 bg-card hover:shadow-md"
                        )}
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        {isPopular && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center gap-1 shadow-sm">
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
                          <div className="mt-1.5 text-[10px] text-muted-foreground">
                            Ends: {format(pkgEndDate, "d MMM yyyy")}
                          </div>
                          {isSelected && (
                            <div className="mt-2 flex justify-center">
                              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center animate-scale-in">
                                <Check className="w-3 h-3 text-accent-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Custom/Daily Packages */}
            <TabsContent value="custom" className="mt-4">
              {isDataLoading ? (
                <PackageSkeleton />
              ) : hasActiveMembership ? (
                <div className="p-6 bg-muted/50 border-2 border-muted rounded-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted-foreground/10 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">Daily Passes Not Available</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Daily passes are only available for members without an active gym membership. 
                        Since your membership is valid until {parsedExistingMembershipEndDate ? format(parsedExistingMembershipEndDate, "d MMMM yyyy") : ""}, 
                        please select a monthly plan to extend your membership.
                      </p>
                    </div>
                  </div>
                </div>
              ) : customPackages.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">
                  No daily passes available
                </p>
              ) : (
                <div className="space-y-3">
                  {customPackages.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedCustomPackage(pkg)}
                      disabled={hasActiveMembership}
                      className={cn(
                        "w-full p-4 rounded-xl border-2 transition-all duration-300 flex justify-between items-center",
                        hasActiveMembership
                          ? "border-muted/50 bg-muted/30 opacity-60 cursor-not-allowed"
                          : selectedCustomPackage?.id === pkg.id
                          ? "border-accent bg-accent/10 shadow-lg scale-[1.01]"
                          : "border-border hover:border-accent/50 bg-card"
                      )}
                    >
                      <div className="text-left">
                        <p className="font-semibold">{pkg.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {pkg.duration_days} {pkg.duration_days === 1 ? "Day" : "Days"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-lg font-bold flex items-center",
                          hasActiveMembership ? "text-muted-foreground" : "text-accent"
                        )}>
                          <IndianRupee className="w-4 h-4" />
                          {pkg.price}
                        </span>
                        {selectedCustomPackage?.id === pkg.id && !hasActiveMembership && (
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center animate-scale-in">
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
        </div>

        {/* Personal Trainer Selection */}
        <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
          {isDataLoading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            </div>
          ) : trainers.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-xl transition-all duration-200">
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

              {parsedExistingPTEndDate && wantsTrainer && (
                <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20 animate-fade-in">
                  <Dumbbell className="w-4 h-4 text-accent" />
                  <span className="text-sm text-muted-foreground">
                    Current PT ends:{" "}
                    <span className="font-semibold text-accent">
                      {format(parsedExistingPTEndDate, "d MMMM yyyy")}
                    </span>
                    {propPtStartDate && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (New PT starts {format(new Date(propPtStartDate), "d MMM yyyy")})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {wantsTrainer && (
                <div className="space-y-4 pl-2 animate-fade-in">
                  {/* Trainer Selection - Card Radio Style */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Select Trainer</h4>
                    <div className="space-y-2">
                      {trainers.map((trainer, idx) => {
                        const isSelected = selectedTrainer?.id === trainer.id;
                        return (
                          <button
                            key={trainer.id}
                            onClick={() => setSelectedTrainer(trainer)}
                            className={cn(
                              "w-full p-4 rounded-xl border-2 transition-all duration-300 flex items-center gap-3 animate-fade-in",
                              isSelected
                                ? "border-accent bg-accent/10 shadow-md"
                                : "border-border hover:border-accent/50 bg-card"
                            )}
                            style={{ animationDelay: `${idx * 60}ms` }}
                          >
                            {/* Radio indicator */}
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200",
                              isSelected ? "border-accent bg-accent" : "border-muted-foreground/30"
                            )}>
                              {isSelected && (
                                <div className="w-2 h-2 rounded-full bg-accent-foreground animate-scale-in" />
                              )}
                            </div>
                            
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="w-5 h-5 text-primary" />
                            </div>
                            <div className="text-left flex-1">
                              <p className="font-medium">{trainer.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {trainer.specialization || "General Training"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-accent flex items-center">
                                <IndianRupee className="w-4 h-4" />
                                {trainer.monthly_fee}
                              </p>
                              <p className="text-xs text-muted-foreground">/month</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* PT Duration Selection */}
                  {selectedTrainer && ptDurationOptions.length > 0 && (
                    <div className="space-y-3 animate-fade-in">
                      <h4 className="text-sm font-medium text-muted-foreground">PT Duration</h4>
                      <div className="p-3 bg-primary/10 rounded-lg flex items-center gap-2 text-sm border border-primary/20">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-muted-foreground">
                          {!isNewMember && existingMembershipEndDate ? "New g" : "G"}ym membership ends:{" "}
                          <span className="font-medium text-primary">
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
                            className={cn(
                              "w-full p-3 rounded-xl border-2 transition-all duration-300",
                              !option.isValid
                                ? "border-border/50 bg-muted/30 opacity-50 cursor-not-allowed"
                                : selectedPTOption?.label === option.label
                                ? "border-accent bg-accent/10 shadow-md"
                                : "border-border hover:border-accent/50 bg-card"
                            )}
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
                                  <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center animate-scale-in">
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
        </div>

        {/* Price Breakdown */}
        <div className="bg-muted rounded-xl p-4 space-y-3 animate-fade-in" style={{ animationDelay: "200ms" }}>
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
              {ptStartDate && (
                <div className="text-xs text-muted-foreground">
                  PT: {format(ptStartDate, "d MMM yyyy")} → {format(selectedPTOption.endDate, "d MMM yyyy")}
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
            className="flex-1 transition-all duration-200"
            onClick={handleSubmit}
            disabled={
              isLoading || 
              isDataLoading ||
              (packageType === "monthly" && !selectedMonthlyPackage) || 
              (packageType === "custom" && (!selectedCustomPackage || hasActiveMembership)) || 
              (wantsTrainer && !selectedTrainer)
            }
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
