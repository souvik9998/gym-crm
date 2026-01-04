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
import { Phone, Calendar, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  name: string;
  phone: string;
}

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddPaymentDialog = ({ open, onOpenChange, onSuccess }: AddPaymentDialogProps) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [months, setMonths] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [monthlyFee, setMonthlyFee] = useState(500);

  useEffect(() => {
    if (open) {
      fetchSettings();
      setMember(null);
      setPhone("");
    }
  }, [open]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("gym_settings")
      .select("monthly_fee")
      .limit(1)
      .maybeSingle();

    if (data) {
      setMonthlyFee(Number(data.monthly_fee));
    }
  };

  const handleSearch = async () => {
    if (phone.length !== 10) {
      toast({
        title: "Invalid Phone",
        description: "Enter a valid 10-digit phone number",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone")
        .eq("phone", phone)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setMember(data);
      } else {
        toast({
          title: "Member Not Found",
          description: "No member with this phone number exists",
          variant: "destructive",
        });
        setMember(null);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const totalAmount = monthlyFee * months;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!member) {
      toast({
        title: "No Member Selected",
        description: "Search for a member first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Get current subscription
      const { data: currentSub } = await supabase
        .from("subscriptions")
        .select("end_date")
        .eq("member_id", member.id)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Calculate new dates
      const isExpired = !currentSub || new Date(currentSub.end_date) < new Date();
      const startDate = isExpired ? new Date() : new Date(currentSub.end_date);
      if (!isExpired) startDate.setDate(startDate.getDate() + 1);

      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);

      // Create subscription
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

      // Create payment record
      const { error: paymentError } = await supabase.from("payments").insert({
        member_id: member.id,
        subscription_id: subscription.id,
        amount: totalAmount,
        payment_mode: "cash",
        status: "success",
        notes: "Cash payment via admin",
      });

      if (paymentError) throw paymentError;

      toast({ title: "Payment recorded successfully" });
      onSuccess();
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Cash Payment</DialogTitle>
          <DialogDescription>
            Add a cash payment for an existing member
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
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

              <div className="space-y-2">
                <Label htmlFor="payment-months" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" />
                  Extend Membership
                </Label>
                <select
                  id="payment-months"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="flex h-12 w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-base"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                </select>
              </div>

              <div className="bg-muted rounded-xl p-4">
                <div className="flex justify-between font-bold">
                  <span>Amount (Cash)</span>
                  <span className="text-accent">₹{totalAmount.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3">
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
              disabled={isLoading || !member}
            >
              {isLoading ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
