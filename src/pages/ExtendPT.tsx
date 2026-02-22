import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Dumbbell, Calendar, IndianRupee, User, Check, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useRazorpay } from "@/hooks/useRazorpay";
import { addDays, addMonths, differenceInDays, format, isBefore, isAfter, parseISO } from "date-fns";
import { fetchPublicBranch, fetchPublicTrainers } from "@/api/publicData";
import { getWhatsAppAutoSendPreference } from "@/utils/whatsappAutoSend";

interface Trainer {
  id: string;
  name: string;
  specialization: string | null;
  monthly_fee: number;
}

interface PTDurationOption {
  label: string;
  endDate: Date;
  days: number;
  fee: number;
  isValid: boolean;
}

const ExtendPT = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { initiatePayment, isLoading } = useRazorpay();

  const member = location.state?.member;
  const branchId = location.state?.branchId || member?.branch_id;
  const stateBranchName = location.state?.branchName;
  const membershipStartDate = location.state?.membershipStartDate ? new Date(location.state.membershipStartDate) : null;
  const membershipEndDate = location.state?.membershipEndDate ? new Date(location.state.membershipEndDate) : null;

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [selectedOption, setSelectedOption] = useState<PTDurationOption | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [existingPTEndDate, setExistingPTEndDate] = useState<Date | null>(null);
  const [branchInfo, setBranchInfo] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!member) {
      toast.error("Access Denied", {
        description: "Please access this page from the home page.",
      });
      navigate("/");
      return;
    }
    if (!membershipEndDate) {
      toast.error("No Active Membership", {
        description: "You need an active gym membership to add personal training.",
      });
      navigate("/");
      return;
    }

    // Set branch info from state or fetch it using secure public API
    if (stateBranchName && branchId) {
      setBranchInfo({ id: branchId, name: stateBranchName });
    } else if (branchId) {
      fetchPublicBranch(branchId).then((branch) => {
        if (branch) {
          setBranchInfo(branch);
        }
      });
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setIsLoadingData(true);
    
    try {
      // Fetch trainers using secure public API
      const trainersData = await fetchPublicTrainers(branchId);

      if (trainersData.length > 0) {
        // Map to expected format with null specialization (not exposed publicly)
        const mappedTrainers = trainersData.map(t => ({
          id: t.id,
          name: t.name,
          specialization: null,
          monthly_fee: t.monthly_fee,
        }));
        setTrainers(mappedTrainers);
        setSelectedTrainer(mappedTrainers[0]);
      }

      // Fetch existing active PT subscription for this member to determine start date
      // This uses RPC which is allowed
      const today = new Date().toISOString().split("T")[0];
      const { data: existingPT } = await supabase
        .from("pt_subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .gte("end_date", today)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingPT?.end_date) {
        setExistingPTEndDate(parseISO(existingPT.end_date));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }

    setIsLoadingData(false);
  };

  // Calculate the PT start date based on existing PT subscriptions or gym membership start
  const ptStartDate = useMemo(() => {
    if (existingPTEndDate) {
      // Start from day after existing PT ends
      return addDays(existingPTEndDate, 1);
    }
    // No existing PT - use gym membership start date
    if (membershipStartDate) {
      const startDate = new Date(membershipStartDate);
      startDate.setHours(0, 0, 0, 0);
      return startDate;
    }
    // Fallback to today if no membership start date available
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [existingPTEndDate, membershipStartDate]);

  // Generate dynamic PT duration options
  const ptDurationOptions = useMemo((): PTDurationOption[] => {
    if (!membershipEndDate || !selectedTrainer) return [];

    const options: PTDurationOption[] = [];
    const dailyRate = selectedTrainer.monthly_fee / 30;

    // Generate 1-month, 2-month, 3-month options from ptStartDate
    for (let months = 1; months <= 3; months++) {
      const optionEndDate = addMonths(ptStartDate, months);
      const isValid = isBefore(optionEndDate, membershipEndDate) || optionEndDate.getTime() === membershipEndDate.getTime();
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

    // Add "Till Membership End" option if it's different from existing options
    const daysToMembershipEnd = differenceInDays(membershipEndDate, ptStartDate);
    const existingMatchingOption = options.find(
      (opt) => opt.isValid && Math.abs(differenceInDays(opt.endDate, membershipEndDate)) <= 1
    );

    if (!existingMatchingOption && daysToMembershipEnd > 0) {
      const fee = Math.ceil(dailyRate * daysToMembershipEnd);
      options.push({
        label: `Till ${format(membershipEndDate, "d MMM yyyy")}`,
        endDate: membershipEndDate,
        days: daysToMembershipEnd,
        fee,
        isValid: true,
      });
    }

    return options;
  }, [membershipEndDate, selectedTrainer, ptStartDate]);

  // Auto-select first valid option only when trainer changes
  useEffect(() => {
    if (selectedTrainer && membershipEndDate) {
      const dailyRate = selectedTrainer.monthly_fee / 30;
      
      // Find first valid option (1 month that doesn't exceed membership)
      const oneMonthEnd = addMonths(ptStartDate, 1);
      const isOneMonthValid = isBefore(oneMonthEnd, membershipEndDate) || oneMonthEnd.getTime() === membershipEndDate.getTime();
      
      if (isOneMonthValid) {
        const days = differenceInDays(oneMonthEnd, ptStartDate);
        setSelectedOption({
          label: "1 Month",
          endDate: oneMonthEnd,
          days,
          fee: Math.ceil(dailyRate * days),
          isValid: true,
        });
      } else {
        // If 1 month exceeds, use till membership end
        const daysToEnd = differenceInDays(membershipEndDate, ptStartDate);
        if (daysToEnd > 0) {
          setSelectedOption({
            label: `Till ${format(membershipEndDate, "d MMM yyyy")}`,
            endDate: membershipEndDate,
            days: daysToEnd,
            fee: Math.ceil(dailyRate * daysToEnd),
            isValid: true,
          });
        } else {
          setSelectedOption(null);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrainer?.id]);

  const handleSubmit = async () => {
    if (!selectedTrainer || !selectedOption || !member) return;

    initiatePayment({
      amount: selectedOption.fee,
      memberId: member.id,
      memberName: member.name,
      memberPhone: member.phone,
      isNewMember: false,
      months: 0,
      customDays: selectedOption.days,
      trainerId: selectedTrainer.id,
      trainerFee: selectedOption.fee,
      ptStartDate: format(ptStartDate, "yyyy-MM-dd"),
      onSuccess: async (data) => {
        // Send WhatsApp notification for PT extension (if auto-send enabled)
        try {
          const shouldAutoSend = await getWhatsAppAutoSendPreference(branchId, "pt_extension");
          if (shouldAutoSend) {
            await supabase.functions.invoke("send-whatsapp", {
              body: {
                phone: member.phone,
                name: member.name,
                endDate: format(selectedOption.endDate, "yyyy-MM-dd"),
                type: "pt_extension",
                memberIds: [member.id],
                isManual: false,
                branchId: branchId,
                branchName: branchInfo?.name,
              },
            });
          }
        } catch (err) {
          console.error("Failed to send WhatsApp notification:", err);
        }
        
        navigate("/success", {
          state: {
            memberName: member.name,
            phone: member.phone,
            amount: selectedOption.fee,
            endDate: format(selectedOption.endDate, "d MMMM yyyy"),
            isNewMember: false,
            hasTrainer: true,
            trainerName: selectedTrainer.name,
            isPTExtension: true,
            branchName: branchInfo?.name,
          },
        });
      },
      onError: (error) => {
        toast.error("Payment Failed", {
          description: error,
        });
      },
    });
  };

  if (!member || !membershipEndDate) return null;

  const validOptionsCount = ptDurationOptions.filter((opt) => opt.isValid).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/", { state: { returnToOptions: true, phone: member.phone } })}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Dumbbell className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold text-foreground">Extend Personal Training</span>
        </div>
      </header>

      <main className="px-4 pb-8">
        <Card className="max-w-md mx-auto border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Add Personal Training</CardTitle>
            <CardDescription>
              Hi {member.name}! Extend your personal training subscription
            </CardDescription>
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Gym membership valid till:{" "}
                  <span className="font-semibold text-foreground">
                    {format(membershipEndDate, "d MMMM yyyy")}
                  </span>
                </span>
              </div>
              {existingPTEndDate && (
                <div className="flex items-center gap-2 p-3 bg-accent/10 rounded-lg border border-accent/20">
                  <Dumbbell className="w-4 h-4 text-accent" />
                  <span className="text-sm text-muted-foreground">
                    Existing PT ends:{" "}
                    <span className="font-semibold text-accent">
                      {format(existingPTEndDate, "d MMMM yyyy")}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      (New PT starts {format(ptStartDate, "d MMM yyyy")})
                    </span>
                  </span>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {isLoadingData ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : trainers.length === 0 ? (
              <div className="text-center py-8">
                <Dumbbell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No trainers available at the moment</p>
              </div>
            ) : (
              <>
                {/* Trainer Selection */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground">Select Trainer</h3>
                  {trainers.map((trainer) => (
                    <button
                      type="button"
                      key={trainer.id}
                      onClick={() => setSelectedTrainer(trainer)}
                      className={`w-full p-4 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${
                        selectedTrainer?.id === trainer.id
                          ? "border-accent bg-accent/10 shadow-lg"
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

                {/* Duration Options */}
                {selectedTrainer && (
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm text-muted-foreground">Select Duration</h3>
                    {validOptionsCount === 0 ? (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="w-5 h-5" />
                          <p className="text-sm font-medium">
                            Your membership ends too soon to add PT subscription
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {ptDurationOptions.map((option, idx) => (
                          <div
                            key={idx}
                            role="button"
                            tabIndex={option.isValid ? 0 : -1}
                            onClick={() => {
                              if (option.isValid) {
                                setSelectedOption(option);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (option.isValid && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                setSelectedOption(option);
                              }
                            }}
                            className={`w-full p-4 rounded-xl border-2 transition-all duration-200 ${
                              !option.isValid
                                ? "border-border/50 bg-muted/30 opacity-50 cursor-not-allowed"
                                : selectedOption?.label === option.label
                                ? "border-accent bg-accent/10 shadow-lg"
                                : "border-border hover:border-accent/50 bg-card"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="text-left">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{option.label}</p>
                                  {!option.isValid && (
                                    <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
                                      Exceeds membership
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {option.days} days • Ends {format(option.endDate, "d MMM yyyy")}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-accent flex items-center">
                                  <IndianRupee className="w-4 h-4" />
                                  {option.fee.toLocaleString("en-IN")}
                                </span>
                                {option.isValid && selectedOption?.label === option.label && (
                                  <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                                    <Check className="w-3 h-3 text-accent-foreground" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Price Summary */}
                {selectedOption && selectedTrainer && (
                  <div className="bg-muted rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Dumbbell className="w-4 h-4" />
                        {selectedTrainer.name} • {selectedOption.days} days
                      </span>
                      <span className="font-semibold flex items-center">
                        <IndianRupee className="w-4 h-4" />
                        {selectedOption.fee.toLocaleString("en-IN")}
                      </span>
                    </div>
                    {existingPTEndDate && (
                      <div className="text-xs text-muted-foreground">
                        Starts: {format(ptStartDate, "d MMM yyyy")} → Ends: {format(selectedOption.endDate, "d MMM yyyy")}
                      </div>
                    )}
                    <div className="border-t border-border pt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-lg">Total</span>
                        <span className="text-2xl font-semibold text-accent flex items-center">
                          <IndianRupee className="w-5 h-5" />
                          {selectedOption.fee.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    variant="accent"
                    size="lg"
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={isLoading || !selectedTrainer || !selectedOption || validOptionsCount === 0}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      <>Pay ₹{selectedOption?.fee.toLocaleString("en-IN") || 0}</>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Secure payment powered by Razorpay
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ExtendPT;
