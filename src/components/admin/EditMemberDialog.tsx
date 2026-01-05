import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, User, Phone, Save, Plus } from "lucide-react";

interface Member {
  id: string;
  name: string;
  phone: string;
  join_date: string;
  subscription?: {
    id: string;
    status: string;
    end_date: string;
    start_date: string;
  };
}

interface EditMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Member | null;
  onSuccess: () => void;
}

export const EditMemberDialog = ({
  open,
  onOpenChange,
  member,
  onSuccess,
}: EditMemberDialogProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [extendMonths, setExtendMonths] = useState("1");

  useEffect(() => {
    if (member) {
      setName(member.name);
      setPhone(member.phone);
    }
  }, [member]);

  const handleSaveMember = async () => {
    if (!member) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("members")
        .update({ name, phone })
        .eq("id", member.id);

      if (error) throw error;

      toast({ title: "Member updated successfully" });
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

  const handleExtendSubscription = async () => {
    if (!member?.subscription) return;
    setIsLoading(true);

    try {
      const currentEndDate = new Date(member.subscription.end_date);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + parseInt(extendMonths));

      const { error } = await supabase
        .from("subscriptions")
        .update({ 
          end_date: newEndDate.toISOString().split("T")[0],
          status: "active"
        })
        .eq("id", member.subscription.id);

      if (error) throw error;

      toast({ title: `Subscription extended by ${extendMonths} month(s)` });
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

  const handleCreateSubscription = async () => {
    if (!member) return;
    setIsLoading(true);

    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + parseInt(extendMonths));

      const { error } = await supabase.from("subscriptions").insert({
        member_id: member.id,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        plan_months: parseInt(extendMonths),
        status: "active",
      });

      if (error) throw error;

      toast({ title: "Subscription created successfully" });
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

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Edit Member
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Member Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Member name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="flex gap-2">
                <div className="flex items-center px-3 bg-muted rounded-md border">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">+91</span>
                </div>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit number"
                  className="flex-1"
                />
              </div>
            </div>
            <Button
              onClick={handleSaveMember}
              disabled={isLoading || !name || phone.length !== 10}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>

          {/* Subscription Section */}
          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Subscription
            </h4>

            {member.subscription ? (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium capitalize">{member.subscription.status}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Expires:</span>
                    <span className="font-medium">
                      {new Date(member.subscription.end_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Select value={extendMonths} onValueChange={setExtendMonths}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Month</SelectItem>
                      <SelectItem value="3">3 Months</SelectItem>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={handleExtendSubscription}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Extend
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No active subscription</p>
                <div className="flex gap-2">
                  <Select value={extendMonths} onValueChange={setExtendMonths}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Month</SelectItem>
                      <SelectItem value="3">3 Months</SelectItem>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="accent"
                    onClick={handleCreateSubscription}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Subscription
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
