import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { AdminLayout } from "@/components/admin/AdminLayout";

interface Trainer {
  id: string;
  name: string;
  phone: string | null;
  specialization: string | null;
  monthly_fee: number;
  monthly_salary: number;
  is_active: boolean;
  payment_category: "monthly_percentage" | "session_basis";
  percentage_fee: number;
  session_fee: number;
}

const TrainersPage = () => {
  const { currentBranch } = useBranch();
  const [refreshKey, setRefreshKey] = useState(0);

  // Trainers
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [newTrainer, setNewTrainer] = useState({ 
    name: "", 
    phone: "", 
    specialization: "", 
    monthly_fee: "",
    monthly_salary: "",
    payment_category: "monthly_percentage" as "monthly_percentage" | "session_basis",
    percentage_fee: "",
    session_fee: "",
  });
  const [editingTrainerId, setEditingTrainerId] = useState<string | null>(null);
  const [editTrainerData, setEditTrainerData] = useState({ 
    name: "", 
    phone: "", 
    specialization: "", 
    monthly_fee: "",
    monthly_salary: "",
    payment_category: "monthly_percentage" as "monthly_percentage" | "session_basis",
    percentage_fee: "",
    session_fee: "",
  });

  // Confirm Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
    variant: "default",
  });

  useEffect(() => {
    if (currentBranch?.id) {
      fetchTrainers();
    }
  }, [refreshKey, currentBranch?.id]);

  const fetchTrainers = async () => {
    if (!currentBranch?.id) return;
    
    const { data: trainersData } = await supabase
      .from("personal_trainers")
      .select("*")
      .eq("branch_id", currentBranch.id)
      .order("name");

    if (trainersData) {
      setTrainers(trainersData.map(t => ({
        ...t,
        monthly_salary: t.monthly_salary ?? 0,
        payment_category: t.payment_category as "monthly_percentage" | "session_basis",
      })));
    }
  };

  const handleAddTrainer = async () => {
    if (!newTrainer.name) {
      toast.error("Please fill trainer name");
      return;
    }

    if (!newTrainer.monthly_fee) {
      toast.error("Monthly fee (member charge) is required");
      return;
    }

    if (newTrainer.payment_category === "session_basis" && !newTrainer.session_fee) {
      toast.error("Session fee is required for session basis category");
      return;
    }

    const { error } = await supabase.from("personal_trainers").insert({
      name: newTrainer.name,
      phone: newTrainer.phone || null,
      specialization: newTrainer.specialization || null,
      monthly_fee: Number(newTrainer.monthly_fee) || 0,
      monthly_salary: Number(newTrainer.monthly_salary) || 0,
      payment_category: newTrainer.payment_category,
      percentage_fee: Number(newTrainer.percentage_fee) || 0,
      session_fee: Number(newTrainer.session_fee) || 0,
      branch_id: currentBranch?.id,
    });

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "trainers",
        type: "trainer_added",
        description: `Added trainer "${newTrainer.name}" with ${newTrainer.payment_category === "monthly_percentage" ? "monthly + percentage" : "session"} payment`,
        entityType: "personal_trainers",
        entityName: newTrainer.name,
        newValue: { 
          name: newTrainer.name, 
          payment_category: newTrainer.payment_category,
          monthly_fee: Number(newTrainer.monthly_fee) || 0,
          monthly_salary: Number(newTrainer.monthly_salary) || 0,
          percentage_fee: Number(newTrainer.percentage_fee) || 0,
          session_fee: Number(newTrainer.session_fee) || 0,
        },
      });
      toast.success("Trainer added");
      setNewTrainer({ 
        name: "", 
        phone: "", 
        specialization: "", 
        monthly_fee: "",
        monthly_salary: "",
        payment_category: "monthly_percentage",
        percentage_fee: "",
        session_fee: "",
      });
      fetchTrainers();
    }
  };

  const handleEditTrainer = (trainer: Trainer) => {
    setEditingTrainerId(trainer.id);
    setEditTrainerData({
      name: trainer.name,
      phone: trainer.phone || "",
      specialization: trainer.specialization || "",
      monthly_fee: String(trainer.monthly_fee),
      monthly_salary: String(trainer.monthly_salary || 0),
      payment_category: trainer.payment_category,
      percentage_fee: String(trainer.percentage_fee || 0),
      session_fee: String(trainer.session_fee || 0),
    });
  };

  const handleSaveTrainer = async (id: string) => {
    if (!editTrainerData.name) {
      toast.error("Name is required");
      return;
    }

    if (!editTrainerData.monthly_fee) {
      toast.error("Monthly fee (member charge) is required");
      return;
    }

    const trainer = trainers.find(t => t.id === id);
    const oldValue = trainer ? {
      name: trainer.name,
      phone: trainer.phone,
      specialization: trainer.specialization,
      monthly_fee: trainer.monthly_fee,
      monthly_salary: trainer.monthly_salary,
      payment_category: trainer.payment_category,
      percentage_fee: trainer.percentage_fee,
      session_fee: trainer.session_fee,
    } : null;

    const { error } = await supabase
      .from("personal_trainers")
      .update({
        name: editTrainerData.name,
        phone: editTrainerData.phone || null,
        specialization: editTrainerData.specialization || null,
        monthly_fee: Number(editTrainerData.monthly_fee) || 0,
        monthly_salary: Number(editTrainerData.monthly_salary) || 0,
        payment_category: editTrainerData.payment_category,
        percentage_fee: Number(editTrainerData.percentage_fee) || 0,
        session_fee: Number(editTrainerData.session_fee) || 0,
      })
      .eq("id", id);

    if (error) {
      toast.error("Error", {
        description: error.message,
      });
    } else {
      await logAdminActivity({
        category: "trainers",
        type: "trainer_updated",
        description: `Updated trainer "${editTrainerData.name}"`,
        entityType: "personal_trainers",
        entityId: id,
        entityName: editTrainerData.name,
        oldValue,
        newValue: {
          name: editTrainerData.name,
          phone: editTrainerData.phone || null,
          specialization: editTrainerData.specialization || null,
          monthly_fee: Number(editTrainerData.monthly_fee) || 0,
          monthly_salary: Number(editTrainerData.monthly_salary) || 0,
          payment_category: editTrainerData.payment_category,
          percentage_fee: Number(editTrainerData.percentage_fee) || 0,
          session_fee: Number(editTrainerData.session_fee) || 0,
        },
      });
      toast.success("Trainer updated");
      setEditingTrainerId(null);
      fetchTrainers();
    }
  };

  const handleToggleTrainer = async (id: string, isActive: boolean) => {
    const trainer = trainers.find(t => t.id === id);
    await supabase.from("personal_trainers").update({ is_active: isActive }).eq("id", id);
    await logAdminActivity({
      category: "trainers",
      type: "trainer_toggled",
      description: `${isActive ? "Activated" : "Deactivated"} trainer "${trainer?.name}"`,
      entityType: "personal_trainers",
      entityId: id,
      entityName: trainer?.name,
      oldValue: { is_active: !isActive },
      newValue: { is_active: isActive },
    });
    fetchTrainers();
  };

  const handleDeleteTrainer = (id: string, name: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Trainer",
      description: `Are you sure you want to delete "${name}"?`,
      variant: "destructive",
      onConfirm: async () => {
        const trainer = trainers.find(t => t.id === id);
        await supabase.from("personal_trainers").delete().eq("id", id);
        await logAdminActivity({
          category: "trainers",
          type: "trainer_deleted",
          description: `Deleted trainer "${name}"`,
          entityType: "personal_trainers",
          entityId: id,
          entityName: name,
          oldValue: trainer ? {
            name: trainer.name,
            phone: trainer.phone,
            specialization: trainer.specialization,
            monthly_fee: trainer.monthly_fee,
          } : null,
        });
        fetchTrainers();
        toast.success("Trainer deleted");
      },
    });
  };

  return (
    <AdminLayout 
      title="Trainers" 
      subtitle="Manage personal trainers"
      onRefresh={() => setRefreshKey(k => k + 1)}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Add Trainer Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Add New Trainer</CardTitle>
            <CardDescription>Add a new personal trainer to your gym</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  placeholder="e.g., Weight Training"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Category *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newTrainer.payment_category === "monthly_percentage"}
                    onChange={() => setNewTrainer({ ...newTrainer, payment_category: "monthly_percentage" })}
                    className="accent-primary"
                  />
                  <span className="text-sm">Monthly + Percentage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newTrainer.payment_category === "session_basis"}
                    onChange={() => setNewTrainer({ ...newTrainer, payment_category: "session_basis" })}
                    className="accent-primary"
                  />
                  <span className="text-sm">Session Basis</span>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Monthly Fee (₹) * <span className="text-xs text-muted-foreground">(Member charge)</span></Label>
                <Input
                  type="number"
                  value={newTrainer.monthly_fee}
                  onChange={(e) => setNewTrainer({ ...newTrainer, monthly_fee: e.target.value })}
                  placeholder="What members pay per month"
                />
              </div>
              
              {newTrainer.payment_category === "monthly_percentage" && (
                <>
                  <div className="space-y-2">
                    <Label>Monthly Salary (₹) <span className="text-xs text-muted-foreground">(Trainer's salary)</span></Label>
                    <Input
                      type="number"
                      value={newTrainer.monthly_salary}
                      onChange={(e) => setNewTrainer({ ...newTrainer, monthly_salary: e.target.value })}
                      placeholder="Trainer's monthly salary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Percentage Fee (%) <span className="text-xs text-muted-foreground">(% of PT fee)</span></Label>
                    <Input
                      type="number"
                      value={newTrainer.percentage_fee}
                      onChange={(e) => setNewTrainer({ ...newTrainer, percentage_fee: e.target.value })}
                      placeholder="e.g., 20"
                    />
                  </div>
                </>
              )}
              {newTrainer.payment_category === "session_basis" && (
                <div className="space-y-2">
                  <Label>Session Fee (₹) * <span className="text-xs text-muted-foreground">(Per session/day)</span></Label>
                  <Input
                    type="number"
                    value={newTrainer.session_fee}
                    onChange={(e) => setNewTrainer({ ...newTrainer, session_fee: e.target.value })}
                    placeholder="Per session fee"
                  />
                </div>
              )}
            </div>
            <Button onClick={handleAddTrainer} className="gap-2">
              <PlusIcon className="w-4 h-4" />
              Add Trainer
            </Button>
          </CardContent>
        </Card>

        {/* Existing Trainers Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Existing Trainers</CardTitle>
            <CardDescription>
              {trainers.length} trainer{trainers.length !== 1 ? 's' : ''} registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trainers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No trainers added yet</p>
            ) : (
              <div className="space-y-3">
                {trainers.map((trainer) => (
                  <div key={trainer.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    {editingTrainerId === trainer.id ? (
                      <div className="flex-1 space-y-3 mr-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Name *</Label>
                            <Input
                              value={editTrainerData.name}
                              onChange={(e) => setEditTrainerData({ ...editTrainerData, name: e.target.value })}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Phone</Label>
                            <Input
                              value={editTrainerData.phone}
                              onChange={(e) => setEditTrainerData({ ...editTrainerData, phone: e.target.value })}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Specialization</Label>
                            <Input
                              value={editTrainerData.specialization}
                              onChange={(e) => setEditTrainerData({ ...editTrainerData, specialization: e.target.value })}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Monthly Fee (₹) * (Member charge)</Label>
                            <Input
                              type="number"
                              value={editTrainerData.monthly_fee}
                              onChange={(e) => setEditTrainerData({ ...editTrainerData, monthly_fee: e.target.value })}
                              className="h-9"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Payment Category *</Label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                checked={editTrainerData.payment_category === "monthly_percentage"}
                                onChange={() => setEditTrainerData({ ...editTrainerData, payment_category: "monthly_percentage" })}
                                className="accent-primary"
                              />
                              <span className="text-xs">Monthly + Percentage</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                checked={editTrainerData.payment_category === "session_basis"}
                                onChange={() => setEditTrainerData({ ...editTrainerData, payment_category: "session_basis" })}
                                className="accent-primary"
                              />
                              <span className="text-xs">Session Basis</span>
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {editTrainerData.payment_category === "monthly_percentage" && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs">Monthly Salary (₹)</Label>
                                <Input
                                  type="number"
                                  value={editTrainerData.monthly_salary}
                                  onChange={(e) => setEditTrainerData({ ...editTrainerData, monthly_salary: e.target.value })}
                                  className="h-9"
                                  placeholder="Trainer's salary"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Percentage Fee (%)</Label>
                                <Input
                                  type="number"
                                  value={editTrainerData.percentage_fee}
                                  onChange={(e) => setEditTrainerData({ ...editTrainerData, percentage_fee: e.target.value })}
                                  className="h-9"
                                  placeholder="% of PT fee"
                                />
                              </div>
                            </>
                          )}
                          {editTrainerData.payment_category === "session_basis" && (
                            <div className="space-y-1">
                              <Label className="text-xs">Session Fee (₹) *</Label>
                              <Input
                                type="number"
                                value={editTrainerData.session_fee}
                                onChange={(e) => setEditTrainerData({ ...editTrainerData, session_fee: e.target.value })}
                                className="h-9"
                                placeholder="Per session fee"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{trainer.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {trainer.specialization || "General"} • ₹{trainer.monthly_fee}/month
                          {trainer.payment_category === "monthly_percentage" && trainer.percentage_fee > 0 && ` + ${trainer.percentage_fee}%`}
                          {trainer.payment_category === "session_basis" && ` • ₹${trainer.session_fee}/session`}
                          {trainer.phone && ` • ${trainer.phone}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trainer.payment_category === "monthly_percentage" ? "Monthly + Percentage" : "Session Basis"}
                          {trainer.payment_category === "monthly_percentage" && trainer.monthly_salary > 0 && ` • Salary: ₹${trainer.monthly_salary}/month`}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editingTrainerId === trainer.id ? (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => handleSaveTrainer(trainer.id)}>
                            <CheckIcon className="w-4 h-4 text-success" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingTrainerId(null)}>
                            <XMarkIcon className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`trainer-${trainer.id}`} className="text-sm">Active</Label>
                            <Switch
                              id={`trainer-${trainer.id}`}
                              checked={trainer.is_active}
                              onCheckedChange={(checked) => handleToggleTrainer(trainer.id, checked)}
                            />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleEditTrainer(trainer)}>
                            <PencilIcon className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteTrainer(trainer.id, trainer.name)}
                          >
                            <TrashIcon className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText="Delete"
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
      />
    </AdminLayout>
  );
};

export default TrainersPage;
