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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { createMembershipIncomeEntry, calculateTrainerPercentageExpense } from "@/hooks/useLedger";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, addMonths } from "date-fns";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
});

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

export const AddMemberDialog = ({ open, onOpenChange, onSuccess }: AddMemberDialogProps) => {
  
  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  // Personal details
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showDobPicker, setShowDobPicker] = useState(false);
  
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

  useEffect(() => {
    if (open) {
      fetchPackages();
      fetchTrainers();
    }
  }, [open]);

  const fetchPackages = async () => {
    const { data } = await supabase
      .from("monthly_packages")
      .select("*")
      .eq("is_active", true)
      .order("months");

    if (data && data.length > 0) {
      setMonthlyPackages(data);
      setSelectedPackageId(data[0].id);
      setMonthlyFee(Number(data[0].price));
      setJoiningFee(Number(data[0].joining_fee));
    }
  };

  const fetchTrainers = async () => {
    const { data } = await supabase
      .from("personal_trainers")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (data && data.length > 0) {
      setTrainers(data);
      setSelectedTrainerId(data[0].id);
      setPtFee(Number(data[0].monthly_fee));
    }
  };

  const handlePackageChange = (packageId: string) => {
    setSelectedPackageId(packageId);
    const pkg = monthlyPackages.find((p) => p.id === packageId);
    if (pkg) {
      setMonthlyFee(Number(pkg.price));
      setJoiningFee(Number(pkg.joining_fee));
      // Reset PT months if more than gym months
      if (ptMonths > pkg.months) {
        setPtMonths(pkg.months);
      }
    }
  };

  const handleTrainerChange = (trainerId: string) => {
    setSelectedTrainerId(trainerId);
    const trainer = trainers.find((t) => t.id === trainerId);
    if (trainer) {
      setPtFee(Number(trainer.monthly_fee) * ptMonths);
    }
  };

  const handlePtMonthsChange = (months: number) => {
    setPtMonths(months);
    const trainer = trainers.find((t) => t.id === selectedTrainerId);
    if (trainer) {
      setPtFee(Number(trainer.monthly_fee) * months);
    }
  };

  const selectedPackage = monthlyPackages.find((p) => p.id === selectedPackageId);
  const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);
  const gymTotal = monthlyFee + joiningFee;
  const totalAmount = gymTotal + (wantsPT ? ptFee : 0);

  // Generate PT month options based on gym package
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = formSchema.safeParse({ name, phone });
    if (!result.success) {
      toast.error("Invalid Input", {
        description: result.error.errors[0].message,
      });
      return;
    }

    if (!selectedPackageId) {
      toast.error("Please select a package");
      return;
    }

    setIsLoading(true);

    try {
      // Check if member exists
      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (existing) {
        toast.error("Member Exists", {
          description: "A member with this phone number already exists",
        });
        setIsLoading(false);
        return;
      }

      // Create member
      const { data: member, error: memberError } = await supabase
        .from("members")
        .insert({ name, phone })
        .select()
        .single();

      if (memberError) throw memberError;

      // Create member details if any provided
      if (gender || address || photoIdType || photoIdNumber || dateOfBirth) {
        const { error: detailsError } = await supabase.from("member_details").insert({
          member_id: member.id,
          gender: gender || null,
          address: address || null,
          photo_id_type: photoIdType || null,
          photo_id_number: photoIdNumber || null,
          date_of_birth: dateOfBirth ? format(dateOfBirth, "yyyy-MM-dd") : null,
          personal_trainer_id: wantsPT ? selectedTrainerId : null,
        });
        if (detailsError) throw detailsError;
      }

      // Create subscription with selected start date
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
        })
        .select()
        .single();

      if (subError) throw subError;

      // Create PT subscription if selected
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
        });
      }

      // Create payment record (cash)
      const paymentType = wantsPT ? "gym_and_pt" : "gym_membership";
      const { data: paymentRecord, error: paymentError } = await supabase.from("payments").insert({
        member_id: member.id,
        subscription_id: subscription.id,
        amount: totalAmount,
        payment_mode: "cash",
        status: "success",
        payment_type: paymentType,
        notes: "Added via admin dashboard",
      }).select().single();

      if (paymentError) throw paymentError;

      // Create ledger entries for cash payment
      // Gym membership income
      await createMembershipIncomeEntry(
        monthlyFee,
        "gym_membership",
        `New member - ${name} (${selectedPackage?.months || 1} months)`,
        member.id,
        undefined,
        paymentRecord.id
      );

      // Joining fee income (if any)
      if (joiningFee > 0) {
        await createMembershipIncomeEntry(
          joiningFee,
          "joining_fee",
          `Joining fee - ${name}`,
          member.id,
          undefined,
          paymentRecord.id
        );
      }

      // PT subscription income (if any)
      if (wantsPT && ptFee > 0 && selectedTrainer) {
        await createMembershipIncomeEntry(
          ptFee,
          "pt_subscription",
          `PT subscription - ${name} with ${selectedTrainer.name}`,
          member.id,
          undefined,
          paymentRecord.id
        );

        // Calculate trainer percentage expense if applicable
        await calculateTrainerPercentageExpense(
          selectedTrainerId,
          ptFee,
          member.id,
          undefined,
          undefined,
          name
        );
      }

      await logAdminActivity({
        category: "members",
        type: "member_added",
        description: `Added new member "${name}" with ${selectedPackage?.months || 1} month package`,
        entityType: "members",
        entityId: member.id,
        entityName: name,
        newValue: { name, phone, package_months: selectedPackage?.months, total_amount: totalAmount, with_pt: wantsPT },
      });

      // Send WhatsApp notification for new member registration
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const adminUserId = session?.user?.id || null;

        await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone: phone,
            name: name,
            endDate: endDate.toISOString().split("T")[0],
            type: "renewal", // Use renewal type for welcome message
            memberIds: [member.id],
            isManual: true,
            adminUserId: adminUserId,
          },
        });
      } catch (err) {
        console.error("Failed to send WhatsApp notification:", err);
        // Don't fail the whole operation if WhatsApp fails
      }

      toast.success("Member added successfully");
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setPhone("");
    setGender("");
    setAddress("");
    setPhotoIdType("");
    setPhotoIdNumber("");
    setDateOfBirth(undefined);
    setSelectedPackageId("");
    setMonthlyFee(0);
    setJoiningFee(0);
    setWantsPT(false);
    setSelectedTrainerId("");
    setPtMonths(1);
    setPtFee(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today);
  };

  // Calculate max date (user must be at least 10 years old)
  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 10);
  
  // Calculate min date (user must be less than 100 years old)
  const minDobDate = new Date();
  minDobDate.setFullYear(minDobDate.getFullYear() - 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 flex-shrink-0 border-b">
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>
            Add a new member with cash payment
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <form onSubmit={handleSubmit} className="space-y-5 pr-4">
            {/* Contact Details Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Contact Details</h3>
              
              <div className="space-y-2">
                <Label htmlFor="add-name" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-accent" />
                  Full Name *
                </Label>
                <Input
                  id="add-name"
                  placeholder="Enter member name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-accent" />
                  Phone Number *
                </Label>
                <div className="flex">
                  <span className="inline-flex items-center px-4 rounded-l-lg border-2 border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +91
                  </span>
                  <Input
                    id="add-phone"
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="rounded-l-none"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Personal Details Section */}
            <div className="space-y-4 pt-2 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Personal Details</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-accent" />
                    Date of Birth
                  </Label>
                  <Popover open={showDobPicker} onOpenChange={setShowDobPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal h-10 ${
                          !dateOfBirth && "text-muted-foreground"
                        }`}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {dateOfBirth ? format(dateOfBirth, "dd MMM yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                      <CalendarComponent
                        mode="single"
                        selected={dateOfBirth}
                        onSelect={(date) => {
                          setDateOfBirth(date);
                          setShowDobPicker(false);
                        }}
                        disabled={(date) => date > maxDobDate || date < minDobDate}
                        defaultMonth={dateOfBirth || new Date(2000, 0, 1)}
                        captionLayout="dropdown-buttons"
                        fromYear={1925}
                        toYear={maxDobDate.getFullYear()}
                        initialFocus
                        className="rounded-md border bg-popover"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Photo ID Type</Label>
                  <Select value={photoIdType} onValueChange={(val) => { setPhotoIdType(val); setPhotoIdNumber(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aadhaar">Aadhaar</SelectItem>
                      <SelectItem value="pan">PAN</SelectItem>
                      <SelectItem value="voter">Voter ID</SelectItem>
                      <SelectItem value="driving">Driving License</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {photoIdType && (
                  <div className="space-y-2">
                    <Label htmlFor="add-photo-id" className="flex items-center gap-2">
                      <IdCard className="w-4 h-4 text-accent" />
                      {photoIdType === "aadhaar" ? "Aadhaar" : photoIdType === "pan" ? "PAN" : photoIdType === "voter" ? "Voter ID" : "DL"} Number
                    </Label>
                    <Input
                      id="add-photo-id"
                      placeholder={photoIdType === "aadhaar" ? "XXXX XXXX XXXX" : photoIdType === "pan" ? "ABCDE1234F" : "ID Number"}
                      value={photoIdNumber}
                      onChange={(e) => setPhotoIdNumber(formatIdNumber(e.target.value, photoIdType))}
                      maxLength={photoIdType === "aadhaar" ? 14 : photoIdType === "pan" ? 10 : 20}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-address" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-accent" />
                  Address
                </Label>
                <Input
                  id="add-address"
                  placeholder="Enter address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Package Selection Section */}
            <div className="space-y-4 pt-2 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Membership Package</h3>
              
              {/* Start Date Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-accent" />
                  Membership Start Date
                </Label>
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full p-3 rounded-lg border-2 border-input hover:border-accent/50 bg-card flex items-center justify-between transition-colors text-left"
                    >
                      <span className="font-medium">{format(startDate, "d MMMM yyyy")}</span>
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        if (date) {
                          setStartDate(date);
                          setShowDatePicker(false);
                        }
                      }}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="add-package" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" />
                  Duration *
                </Label>
                <Select value={selectedPackageId} onValueChange={handlePackageChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthlyPackages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.months} {pkg.months === 1 ? "Month" : "Months"} - ₹{pkg.price} + ₹{pkg.joining_fee} joining
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-monthly" className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-accent" />
                    Monthly Fee (₹)
                  </Label>
                  <Input
                    id="edit-monthly"
                    type="number"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-joining" className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-accent" />
                    Joining Fee (₹)
                  </Label>
                  <Input
                    id="edit-joining"
                    type="number"
                    value={joiningFee}
                    onChange={(e) => setJoiningFee(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Personal Training Section */}
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Dumbbell className="w-4 h-4" />
                  Personal Training Add-on
                </h3>
                <Switch checked={wantsPT} onCheckedChange={setWantsPT} />
              </div>

              {wantsPT && trainers.length > 0 && (
                <div className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label>Select Trainer</Label>
                    <Select value={selectedTrainerId} onValueChange={handleTrainerChange}>
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

                  <div className="space-y-2">
                    <Label>PT Duration</Label>
                    <Select value={String(ptMonths)} onValueChange={(v) => handlePtMonthsChange(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ptMonthOptions.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} {m === 1 ? "Month" : "Months"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Max {maxPtMonths} {maxPtMonths === 1 ? "month" : "months"} (matches gym membership)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pt-fee">PT Fee (₹)</Label>
                    <Input
                      id="pt-fee"
                      type="number"
                      value={ptFee}
                      onChange={(e) => setPtFee(Number(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default: ₹{(selectedTrainer?.monthly_fee || 0) * ptMonths}
                    </p>
                  </div>
                </div>
              )}

              {wantsPT && trainers.length === 0 && (
                <p className="text-sm text-muted-foreground">No active trainers available. Add trainers in settings.</p>
              )}
            </div>

            {/* Price Summary */}
            <div className="bg-muted rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gym Membership ({selectedPackage?.months || 0} {selectedPackage?.months === 1 ? "month" : "months"})</span>
                <span>₹{monthlyFee.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Joining Fee</span>
                <span>₹{joiningFee.toLocaleString("en-IN")}</span>
              </div>
              {wantsPT && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Personal Training ({ptMonths} {ptMonths === 1 ? "month" : "months"})</span>
                  <span>₹{ptFee.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>Total (Cash)</span>
                <span className="text-accent">₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="flex gap-3 pb-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="accent" className="flex-1" disabled={isLoading}>
                {isLoading ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
