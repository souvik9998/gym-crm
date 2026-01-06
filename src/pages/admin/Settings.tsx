import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Settings,
  IndianRupee,
  Users,
  Package,
  Save,
  Plus,
  Trash2,
  Dumbbell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface Trainer {
  id: string;
  name: string;
  phone: string | null;
  specialization: string | null;
  monthly_fee: number;
  is_active: boolean;
}

interface CustomPackage {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: boolean;
}

interface GymSettings {
  id: string;
  gym_name: string | null;
  monthly_fee: number;
  joining_fee: number;
  gym_phone: string | null;
  gym_address: string | null;
  monthly_packages: number[];
}

const AdminSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Gym Settings
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [gymName, setGymName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [joiningFee, setJoiningFee] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [monthlyPackages, setMonthlyPackages] = useState<number[]>([1, 3, 6, 12]);

  // Trainers
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [newTrainer, setNewTrainer] = useState({ name: "", phone: "", specialization: "", monthly_fee: "" });

  // Custom Packages
  const [customPackages, setCustomPackages] = useState<CustomPackage[]>([]);
  const [newPackage, setNewPackage] = useState({ name: "", duration_days: "", price: "" });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    // Fetch gym settings
    const { data: settingsData } = await supabase
      .from("gym_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsData) {
      setSettings(settingsData as GymSettings);
      setGymName(settingsData.gym_name || "");
      setMonthlyFee(String(settingsData.monthly_fee));
      setJoiningFee(String(settingsData.joining_fee));
      setGymPhone(settingsData.gym_phone || "");
      setGymAddress(settingsData.gym_address || "");
      setMonthlyPackages(settingsData.monthly_packages || [1, 3, 6, 12]);
    }

    // Fetch trainers
    const { data: trainersData } = await supabase
      .from("personal_trainers")
      .select("*")
      .order("name");

    if (trainersData) {
      setTrainers(trainersData);
    }

    // Fetch custom packages
    const { data: packagesData } = await supabase
      .from("custom_packages")
      .select("*")
      .order("duration_days");

    if (packagesData) {
      setCustomPackages(packagesData);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings?.id) return;
    setIsSaving(true);

    const { error } = await supabase
      .from("gym_settings")
      .update({
        gym_name: gymName,
        monthly_fee: Number(monthlyFee),
        joining_fee: Number(joiningFee),
        gym_phone: gymPhone,
        gym_address: gymAddress,
        monthly_packages: monthlyPackages,
      })
      .eq("id", settings.id);

    setIsSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved successfully" });
    }
  };

  const handleAddTrainer = async () => {
    if (!newTrainer.name || !newTrainer.monthly_fee) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("personal_trainers").insert({
      name: newTrainer.name,
      phone: newTrainer.phone || null,
      specialization: newTrainer.specialization || null,
      monthly_fee: Number(newTrainer.monthly_fee),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Trainer added" });
      setNewTrainer({ name: "", phone: "", specialization: "", monthly_fee: "" });
      fetchData();
    }
  };

  const handleToggleTrainer = async (id: string, isActive: boolean) => {
    await supabase.from("personal_trainers").update({ is_active: isActive }).eq("id", id);
    fetchData();
  };

  const handleDeleteTrainer = async (id: string) => {
    await supabase.from("personal_trainers").delete().eq("id", id);
    fetchData();
    toast({ title: "Trainer deleted" });
  };

  const handleAddPackage = async () => {
    if (!newPackage.name || !newPackage.duration_days || !newPackage.price) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("custom_packages").insert({
      name: newPackage.name,
      duration_days: Number(newPackage.duration_days),
      price: Number(newPackage.price),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Package added" });
      setNewPackage({ name: "", duration_days: "", price: "" });
      fetchData();
    }
  };

  const handleTogglePackage = async (id: string, isActive: boolean) => {
    await supabase.from("custom_packages").update({ is_active: isActive }).eq("id", id);
    fetchData();
  };

  const handleDeletePackage = async (id: string) => {
    await supabase.from("custom_packages").delete().eq("id", id);
    fetchData();
    toast({ title: "Package deleted" });
  };

  const handleAddMonthOption = () => {
    const input = prompt("Enter number of months:");
    if (input) {
      const months = parseInt(input);
      if (months > 0 && !monthlyPackages.includes(months)) {
        setMonthlyPackages([...monthlyPackages, months].sort((a, b) => a - b));
      }
    }
  };

  const handleRemoveMonthOption = (month: number) => {
    setMonthlyPackages(monthlyPackages.filter((m) => m !== month));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Settings className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Admin Settings</h1>
                <p className="text-xs text-muted-foreground">Customize gym settings</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general" className="gap-2">
              <IndianRupee className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="trainers" className="gap-2">
              <Users className="w-4 h-4" />
              Trainers
            </TabsTrigger>
            <TabsTrigger value="packages" className="gap-2">
              <Package className="w-4 h-4" />
              Packages
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dumbbell className="w-5 h-5 text-accent" />
                  Gym Information
                </CardTitle>
                <CardDescription>Basic gym details and contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Gym Name</Label>
                    <Input value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Pro Plus Fitness" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={gymPhone} onChange={(e) => setGymPhone(e.target.value)} placeholder="+91 9876543210" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={gymAddress} onChange={(e) => setGymAddress(e.target.value)} placeholder="Gym address" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="w-5 h-5 text-accent" />
                  Fee Structure
                </CardTitle>
                <CardDescription>Monthly subscription and joining fees</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Monthly Fee (₹)</Label>
                    <Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Joining Fee (₹)</Label>
                    <Input type="number" value={joiningFee} onChange={(e) => setJoiningFee(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Package Options</CardTitle>
                <CardDescription>Configure which monthly durations users can choose</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {monthlyPackages.map((month) => (
                    <div key={month} className="flex items-center gap-1 px-3 py-1.5 bg-muted rounded-full">
                      <span className="text-sm font-medium">{month} {month === 1 ? "Month" : "Months"}</span>
                      <button onClick={() => handleRemoveMonthOption(month)} className="ml-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={handleAddMonthOption}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveSettings} disabled={isSaving} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </TabsContent>

          {/* Personal Trainers */}
          <TabsContent value="trainers" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Trainer</CardTitle>
                <CardDescription>Add personal trainers with their fees</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input
                      value={newTrainer.name}
                      onChange={(e) => setNewTrainer({ ...newTrainer, name: e.target.value })}
                      placeholder="Trainer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={newTrainer.phone}
                      onChange={(e) => setNewTrainer({ ...newTrainer, phone: e.target.value })}
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Specialization</Label>
                    <Input
                      value={newTrainer.specialization}
                      onChange={(e) => setNewTrainer({ ...newTrainer, specialization: e.target.value })}
                      placeholder="e.g., Weight Training, Cardio"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Fee (₹) *</Label>
                    <Input
                      type="number"
                      value={newTrainer.monthly_fee}
                      onChange={(e) => setNewTrainer({ ...newTrainer, monthly_fee: e.target.value })}
                      placeholder="500"
                    />
                  </div>
                </div>
                <Button onClick={handleAddTrainer}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Trainer
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Trainers</CardTitle>
              </CardHeader>
              <CardContent>
                {trainers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No trainers added yet</p>
                ) : (
                  <div className="space-y-3">
                    {trainers.map((trainer) => (
                      <div key={trainer.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{trainer.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {trainer.specialization || "General"} • ₹{trainer.monthly_fee}/month
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`trainer-${trainer.id}`} className="text-sm">Active</Label>
                            <Switch
                              id={`trainer-${trainer.id}`}
                              checked={trainer.is_active}
                              onCheckedChange={(checked) => handleToggleTrainer(trainer.id, checked)}
                            />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTrainer(trainer.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custom Packages */}
          <TabsContent value="packages" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Custom Package</CardTitle>
                <CardDescription>Create packages for daily or custom duration memberships</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Package Name *</Label>
                    <Input
                      value={newPackage.name}
                      onChange={(e) => setNewPackage({ ...newPackage, name: e.target.value })}
                      placeholder="e.g., 1 Week Pass"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (Days) *</Label>
                    <Input
                      type="number"
                      value={newPackage.duration_days}
                      onChange={(e) => setNewPackage({ ...newPackage, duration_days: e.target.value })}
                      placeholder="7"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (₹) *</Label>
                    <Input
                      type="number"
                      value={newPackage.price}
                      onChange={(e) => setNewPackage({ ...newPackage, price: e.target.value })}
                      placeholder="300"
                    />
                  </div>
                </div>
                <Button onClick={handleAddPackage}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Package
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Packages</CardTitle>
              </CardHeader>
              <CardContent>
                {customPackages.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No custom packages added yet</p>
                ) : (
                  <div className="space-y-3">
                    {customPackages.map((pkg) => (
                      <div key={pkg.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{pkg.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {pkg.duration_days} {pkg.duration_days === 1 ? "Day" : "Days"} • ₹{pkg.price}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`pkg-${pkg.id}`} className="text-sm">Active</Label>
                            <Switch
                              id={`pkg-${pkg.id}`}
                              checked={pkg.is_active}
                              onCheckedChange={(checked) => handleTogglePackage(pkg.id, checked)}
                            />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePackage(pkg.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminSettings;
