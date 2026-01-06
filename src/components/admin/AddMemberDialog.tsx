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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddMemberDialog = ({ open, onOpenChange, onSuccess }: AddMemberDialogProps) => {
  const { toast } = useToast();
  
  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  
  // Personal details
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  
  // Package selection
  const [monthlyPackages, setMonthlyPackages] = useState<MonthlyPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  
  // Editable fees
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [joiningFee, setJoiningFee] = useState(0);
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPackages();
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
      // Set default to first package
      setSelectedPackageId(data[0].id);
      setMonthlyFee(Number(data[0].price));
      setJoiningFee(Number(data[0].joining_fee));
    }
  };

  const handlePackageChange = (packageId: string) => {
    setSelectedPackageId(packageId);
    const pkg = monthlyPackages.find((p) => p.id === packageId);
    if (pkg) {
      setMonthlyFee(Number(pkg.price));
      setJoiningFee(Number(pkg.joining_fee));
    }
  };

  const selectedPackage = monthlyPackages.find((p) => p.id === selectedPackageId);
  const totalAmount = monthlyFee + joiningFee;

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
      toast({
        title: "Invalid Input",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    if (!selectedPackageId) {
      toast({
        title: "Please select a package",
        variant: "destructive",
      });
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
        toast({
          title: "Member Exists",
          description: "A member with this phone number already exists",
          variant: "destructive",
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
      if (gender || address || photoIdType || photoIdNumber) {
        const { error: detailsError } = await supabase.from("member_details").insert({
          member_id: member.id,
          gender: gender || null,
          address: address || null,
          photo_id_type: photoIdType || null,
          photo_id_number: photoIdNumber || null,
        });
        if (detailsError) throw detailsError;
      }

      // Create subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (selectedPackage?.months || 1));

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          plan_months: selectedPackage?.months || 1,
          status: "active",
        })
        .select()
        .single();

      if (subError) throw subError;

      // Create payment record (cash)
      const { error: paymentError } = await supabase.from("payments").insert({
        member_id: member.id,
        subscription_id: subscription.id,
        amount: totalAmount,
        payment_mode: "cash",
        status: "success",
        notes: "Added via admin dashboard",
      });

      if (paymentError) throw paymentError;

      toast({ title: "Member added successfully" });
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
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
    setSelectedPackageId("");
    setMonthlyFee(0);
    setJoiningFee(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>
            Add a new member with cash payment
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <form onSubmit={handleSubmit} className="space-y-5 pb-2">
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

            {/* Price Summary */}
            <div className="bg-muted rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscription ({selectedPackage?.months || 0} {selectedPackage?.months === 1 ? "month" : "months"})</span>
                <span>₹{monthlyFee.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Joining Fee</span>
                <span>₹{joiningFee.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>Total (Cash)</span>
                <span className="text-accent">₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="flex gap-3">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};