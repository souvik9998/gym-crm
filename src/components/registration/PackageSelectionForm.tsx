import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Calendar, IndianRupee, Sparkles, User, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

interface GymSettings {
  monthly_fee: number;
  joining_fee: number;
  monthly_packages: number[];
}

interface PackageSelectionFormProps {
  isNewMember: boolean;
  memberName: string;
  onSubmit: (data: PackageSelectionData) => void;
  onBack: () => void;
  isLoading: boolean;
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
}

const PackageSelectionForm = ({ 
  isNewMember, 
  memberName, 
  onSubmit, 
  onBack,
  isLoading 
}: PackageSelectionFormProps) => {
  const [packageType, setPackageType] = useState<"monthly" | "custom">("monthly");
  const [selectedMonths, setSelectedMonths] = useState(3);
  const [selectedCustomPackage, setSelectedCustomPackage] = useState<CustomPackage | null>(null);
  const [wantsTrainer, setWantsTrainer] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);

  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [customPackages, setCustomPackages] = useState<CustomPackage[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Fetch gym settings
    const { data: settingsData } = await supabase
      .from("gym_settings")
      .select("monthly_fee, joining_fee, monthly_packages")
      .limit(1)
      .maybeSingle();

    if (settingsData) {
      setSettings({
        monthly_fee: Number(settingsData.monthly_fee),
        joining_fee: Number(settingsData.joining_fee),
        monthly_packages: settingsData.monthly_packages || [1, 3, 6, 12],
      });
      // Set default selection to first option or 3 if available
      const packages = settingsData.monthly_packages || [1, 3, 6, 12];
      setSelectedMonths(packages.includes(3) ? 3 : packages[0]);
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

  const monthlyFee = settings?.monthly_fee || 500;
  const joiningFee = isNewMember ? (settings?.joining_fee || 200) : 0;
  const monthlyPackages = settings?.monthly_packages || [1, 3, 6, 12];

  // Calculate amounts
  const isCustom = packageType === "custom" && selectedCustomPackage;
  const subscriptionAmount = isCustom 
    ? selectedCustomPackage!.price 
    : monthlyFee * selectedMonths;
  
  const trainerFee = wantsTrainer && selectedTrainer 
    ? (isCustom 
        ? Math.ceil((selectedTrainer.monthly_fee / 30) * selectedCustomPackage!.duration_days)
        : selectedTrainer.monthly_fee * selectedMonths)
    : 0;
  
  const totalAmount = subscriptionAmount + joiningFee + trainerFee;

  const handleSubmit = () => {
    onSubmit({
      selectedMonths: isCustom ? 0 : selectedMonths,
      selectedTrainer: wantsTrainer ? selectedTrainer : null,
      wantsTrainer,
      isCustomPackage: !!isCustom,
      customPackage: isCustom ? selectedCustomPackage : null,
      totalAmount,
      subscriptionAmount,
      joiningFee,
      trainerFee,
    });
  };

  return (
    <Card className="max-w-md mx-auto border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Select Your Plan</CardTitle>
        <CardDescription>
          {isNewMember ? "Welcome" : "Welcome back"}, {memberName}! Choose your membership plan
        </CardDescription>
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
            <div className="grid grid-cols-2 gap-3">
              {monthlyPackages.map((months) => (
                <button
                  key={months}
                  onClick={() => setSelectedMonths(months)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
                    selectedMonths === months
                      ? "border-accent bg-accent/10 shadow-lg"
                      : "border-border hover:border-accent/50 bg-card"
                  }`}
                >
                  {months === 3 && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Popular
                    </span>
                  )}
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-foreground">{months}</div>
                    <div className="text-sm text-muted-foreground">
                      {months === 1 ? "Month" : "Months"}
                    </div>
                    {selectedMonths === months && (
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
              <div className="space-y-3 pl-2">
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
                : `Subscription (${selectedMonths} mo)`
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

          {wantsTrainer && selectedTrainer && trainerFee > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-2">
                <Dumbbell className="w-4 h-4" />
                Trainer ({selectedTrainer.name})
              </span>
              <span className="font-semibold flex items-center">
                <IndianRupee className="w-4 h-4" />
                {trainerFee.toLocaleString("en-IN")}
              </span>
            </div>
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
            disabled={isLoading || (packageType === "custom" && !selectedCustomPackage) || (wantsTrainer && !selectedTrainer)}
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
