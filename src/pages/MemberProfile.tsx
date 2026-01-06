import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  User,
  Phone,
  Calendar,
  CreditCard,
  IndianRupee,
  Dumbbell,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  Download,
  MapPin,
  IdCard,
} from "lucide-react";

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
}

interface MemberDetails {
  gender: string | null;
  address: string | null;
  photo_id_type: string | null;
  personal_trainer?: { name: string } | null;
}

const MemberProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const member = location.state?.member;

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [details, setDetails] = useState<MemberDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!member) {
      navigate("/");
      return;
    }
    fetchData();
  }, [member, navigate]);

  const fetchData = async () => {
    if (!member) return;
    setIsLoading(true);

    try {
      // Fetch member details
      const { data: detailsData } = await supabase
        .from("member_details")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", member.id)
        .maybeSingle();

      if (detailsData) setDetails(detailsData);

      // Fetch subscriptions with trainer info
      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("*, personal_trainer:personal_trainers(name)")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });

      if (subsData) setSubscriptions(subsData);

      // Fetch payments
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });

      if (paymentsData) setPayments(paymentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const currentSubscription = subscriptions.find(
    (s) => s.status === "active" || s.status === "expiring_soon"
  );

  if (!member) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-semibold text-primary">
                  {member.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{member.name}</h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  +91 {member.phone}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-2xl mx-auto space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Current Status Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Membership Status</CardTitle>
              </CardHeader>
              <CardContent>
                {currentSubscription ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {getStatusBadge(currentSubscription.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Valid Until</span>
                      <span className="font-medium">{formatDate(currentSubscription.end_date)}</span>
                    </div>
                    {currentSubscription.personal_trainer && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Personal Trainer</span>
                        <span className="font-medium flex items-center gap-1">
                          <Dumbbell className="w-4 h-4 text-accent" />
                          {currentSubscription.personal_trainer.name}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">No active subscription</p>
                    <Button variant="accent" className="mt-4" onClick={() => navigate("/renew", { state: { member } })}>
                      Renew Membership
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Details Card */}
            {details && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Personal Details</CardTitle>
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
                      <span className="capitalize">{details.photo_id_type} on file</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tabs for History */}
            <Tabs defaultValue="subscriptions">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="subscriptions" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  Subscriptions
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payments
                </TabsTrigger>
              </TabsList>

              {/* Subscriptions Tab */}
              <TabsContent value="subscriptions" className="mt-4 space-y-3">
                {subscriptions.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">No subscription history</p>
                    </CardContent>
                  </Card>
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
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="w-3 h-3" />
                              {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                            </p>
                            {sub.personal_trainer && (
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Dumbbell className="w-3 h-3" />
                                Trainer: {sub.personal_trainer.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="mt-4 space-y-3">
                {payments.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <CreditCard className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">No payment history</p>
                    </CardContent>
                  </Card>
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
                              <p className="font-medium flex items-center gap-1">
                                <IndianRupee className="w-4 h-4" />
                                {Number(payment.amount).toLocaleString("en-IN")}
                              </p>
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
                      </CardContent>
                    </Card>
                  ))
                )}

                {/* Total Summary */}
                {payments.length > 0 && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total Paid</span>
                        <span className="text-xl font-semibold text-accent flex items-center gap-1">
                          <IndianRupee className="w-5 h-5" />
                          {payments
                            .filter((p) => p.status === "success")
                            .reduce((sum, p) => sum + Number(p.amount), 0)
                            .toLocaleString("en-IN")}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default MemberProfile;
