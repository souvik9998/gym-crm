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
import { User, Phone, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number"),
  months: z.number().min(1).max(24),
});

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddMemberDialog = ({ open, onOpenChange, onSuccess }: AddMemberDialogProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [months, setMonths] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [monthlyFee, setMonthlyFee] = useState(500);
  const [joiningFee, setJoiningFee] = useState(200);

  useEffect(() => {
    if (open) {
      fetchSettings();
    }
  }, [open]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("gym_settings")
      .select("monthly_fee, joining_fee")
      .limit(1)
      .maybeSingle();

    if (data) {
      setMonthlyFee(Number(data.monthly_fee));
      setJoiningFee(Number(data.joining_fee));
    }
  };

  const totalAmount = monthlyFee * months + joiningFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = formSchema.safeParse({ name, phone, months });
    if (!result.success) {
      toast({
        title: "Invalid Input",
        description: result.error.errors[0].message,
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

      // Create subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          member_id: member.id,
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDate.toISOString().split("T")[0],
          plan_months: months,
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
    setMonths(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>
            Add a new member with cash payment
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="add-name" className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              Full Name
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
              Phone Number
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

          <div className="space-y-2">
            <Label htmlFor="add-months" className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              Membership Duration
            </Label>
            <select
              id="add-months"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="flex h-12 w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
            </select>
          </div>

          <div className="bg-muted rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subscription</span>
              <span>₹{(monthlyFee * months).toLocaleString("en-IN")}</span>
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
      </DialogContent>
    </Dialog>
  );
};
