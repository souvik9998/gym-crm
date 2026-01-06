import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Calendar, 
  CreditCard, 
  IndianRupee, 
  User, 
  Phone, 
  MapPin,
  IdCard,
  Dumbbell,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  UserX,
} from "lucide-react";

interface MemberActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null;
  memberName: string;
}

interface Subscription {
  id: string;
  start_date: string;
  end_date: string;
  plan_months: number;
  status: string;
  trainer_fee: number | null;
  is_custom_package: boolean | null;
  custom_days: number | null;
  personal_trainer?: { name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_mode: string;
  status: string;
  created_at: string;
  notes: string | null;
  payment_type: string | null;
}

interface PTSubscription {
  id: string;
  start_date: string;
  end_date: string;
  monthly_fee: number;
  total_fee: number;
  status: string;
  personal_trainer: { id: string; name: string; specialization: string | null } | null;
}

interface MemberDetails {
  gender: string | null;
  address: string | null;
  photo_id_type: string | null;
  photo_id_number: string | null;
  personal_trainer?: { name: string } | null;
}

interface MemberData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  join_date: string;
}

export const MemberActivityDialog = ({
  open,
  onOpenChange,
  memberId,
  memberName,
}: MemberActivityDialogProps) => {
  const [member, setMember] = useState<MemberData | null>(null);
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ptSubscriptions, setPtSubscriptions] = useState<PTSubscription[]>([]);
  const [activePT, setActivePT] = useState<PTSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && memberId) {
      fetchMemberData();
    }
  }, [open, memberId]);

  const fetchMemberData = async () => {
    if (!memberId) return;
    setIsLoading(true);

    try {
      // Fetch member info
      const { data: memberData } = await supabase
        .from("members")
        .select("*")
        .eq("id", memberId)
        .single();

      if (memberData) setMember(memberData);

      // Fetch member details
      const { data: detailsData } = await supabase
        .from("member_details")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", memberId)
        .maybeSingle();

      if (detailsData) setDetails(detailsData);

      // Fetch subscriptions with trainer info
      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (subsData) setSubscriptions(subsData);

      // Fetch payments
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (paymentsData) setPayments(paymentsData);

      // Fetch PT subscriptions
      const { data: ptData } = await supabase
        .from("pt_subscriptions")
        .select("*, personal_trainer:personal_trainers(id, name, specialization)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });

      if (ptData) {
        setPtSubscriptions(ptData);
        // Find active PT
        const today = new Date().toISOString().split("T")[0];
        const active = ptData.find(pt => pt.end_date >= today && pt.status === "active");
        setActivePT(active || null);
      }
    } catch (error) {
      console.error("Error fetching member data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
      case "expiring_soon":
        return <Badge className="bg-warning/10 text-warning border-warning/20">Expiring Soon</Badge>;
      case "expired":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getPaymentTypeLabel = (type: string | null) => {
    switch (type) {
      case "gym_and_pt":
        return <Badge variant="outline" className="text-xs">Gym + PT</Badge>;
      case "pt_only":
        return <Badge variant="outline" className="text-xs bg-warning/10 text-warning">PT Only</Badge>;
      case "gym_membership":
      default:
        return <Badge variant="outline" className="text-xs bg-primary/10 text-primary">Gym</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-accent" />
            {memberName}
          </DialogTitle>
          <DialogDescription>
            Member activity, subscriptions, and payment history
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col px-6 pb-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="subscriptions">Gym</TabsTrigger>
              <TabsTrigger value="pt">PT History</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 flex-1 overflow-hidden">
              <ScrollArea className="h-[400px] pr-2">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>+91 {member?.phone}</span>
                      </div>
                      {member?.email && (
                        <div className="flex items-center gap-3">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span>{member.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>Joined: {member?.join_date ? formatDate(member.join_date) : "N/A"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {details && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Personal Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {details.gender && (
                          <div className="flex items-center gap-3">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="capitalize">{details.gender}</span>
                          </div>
                        )}
                        {details.address && (
                          <div className="flex items-center gap-3">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span>{details.address}</span>
                          </div>
                        )}
                        {details.photo_id_type && (
                          <div className="flex items-center gap-3">
                            <IdCard className="w-4 h-4 text-muted-foreground" />
                            <span className="capitalize">{details.photo_id_type}: {details.photo_id_number}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Current PT Status */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Dumbbell className="w-4 h-4" />
                        Personal Training Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {activePT ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{activePT.personal_trainer?.name}</span>
                            <Badge className="bg-success/10 text-success">Active</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(activePT.start_date)} — {formatDate(activePT.end_date)}
                          </p>
                          {activePT.personal_trainer?.specialization && (
                            <p className="text-xs text-muted-foreground">
                              Specialization: {activePT.personal_trainer.specialization}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <UserX className="w-5 h-5" />
                          <span>No active personal training</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-accent">{subscriptions.length}</p>
                        <p className="text-sm text-muted-foreground">Gym Subscriptions</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-success flex items-center justify-center gap-1">
                          <IndianRupee className="w-5 h-5" />
                          {payments
                            .filter((p) => p.status === "success")
                            .reduce((sum, p) => sum + Number(p.amount), 0)
                            .toLocaleString("en-IN")}
                        </p>
                        <p className="text-sm text-muted-foreground">Total Paid</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Subscriptions Tab */}
            <TabsContent value="subscriptions" className="mt-4 flex-1 overflow-hidden">
              <ScrollArea className="h-[400px] pr-2">
                <div className="space-y-3">
                  {subscriptions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No subscriptions found</p>
                  ) : (
                    subscriptions.map((sub) => (
                      <Card key={sub.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {sub.is_custom_package 
                                    ? `${sub.custom_days} Day Pass` 
                                    : `${sub.plan_months} Month${sub.plan_months > 1 ? "s" : ""}`}
                                </span>
                                {getStatusBadge(sub.status)}
                              </div>
                              <div className="text-sm text-muted-foreground space-y-0.5">
                                <p className="flex items-center gap-2">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                                </p>
                                {sub.personal_trainer && (
                                  <p className="flex items-center gap-2">
                                    <Dumbbell className="w-3 h-3" />
                                    Trainer: {sub.personal_trainer.name}
                                    {sub.trainer_fee && ` (₹${sub.trainer_fee})`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* PT History Tab */}
            <TabsContent value="pt" className="mt-4 flex-1 overflow-hidden">
              <ScrollArea className="h-[400px] pr-2">
                <div className="space-y-3">
                  {ptSubscriptions.length === 0 ? (
                    <div className="text-center py-8">
                      <Dumbbell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">No personal training history</p>
                    </div>
                  ) : (
                    ptSubscriptions.map((pt) => (
                      <Card key={pt.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Dumbbell className="w-4 h-4 text-warning" />
                                <span className="font-medium">{pt.personal_trainer?.name || "Unknown Trainer"}</span>
                                {pt.status === "active" && new Date(pt.end_date) >= new Date() ? (
                                  <Badge className="bg-success/10 text-success">Active</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">Completed</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Calendar className="w-3 h-3" />
                                {formatDate(pt.start_date)} — {formatDate(pt.end_date)}
                              </p>
                              {pt.personal_trainer?.specialization && (
                                <p className="text-xs text-muted-foreground">
                                  Specialization: {pt.personal_trainer.specialization}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-accent flex items-center gap-1">
                                <IndianRupee className="w-4 h-4" />
                                {Number(pt.total_fee).toLocaleString("en-IN")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ₹{Number(pt.monthly_fee).toLocaleString("en-IN")}/month
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="mt-4 flex-1 overflow-hidden">
              <ScrollArea className="h-[400px] pr-2">
                <div className="space-y-3">
                  {payments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No payments found</p>
                  ) : (
                    payments.map((payment) => (
                      <Card key={payment.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-muted">
                                {payment.payment_mode === "cash" ? (
                                  <Banknote className="w-4 h-4 text-success" />
                                ) : (
                                  <CreditCard className="w-4 h-4 text-accent" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium flex items-center gap-1">
                                    <IndianRupee className="w-4 h-4" />
                                    {Number(payment.amount).toLocaleString("en-IN")}
                                  </p>
                                  {getPaymentTypeLabel(payment.payment_type)}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(payment.created_at)} • {payment.payment_mode}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getPaymentStatusIcon(payment.status)}
                              <span className="text-sm capitalize">{payment.status}</span>
                            </div>
                          </div>
                          {payment.notes && (
                            <p className="mt-2 text-sm text-muted-foreground">{payment.notes}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
