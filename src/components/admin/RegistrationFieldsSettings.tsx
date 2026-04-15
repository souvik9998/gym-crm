import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { Lock, User, Phone, Calendar, MapPin, IdCard, Upload, Heart, FileText, Dumbbell, Clock } from "lucide-react";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";

interface FieldSetting {
  enabled: boolean;
  required: boolean;
  locked: boolean;
}

interface RegistrationFields {
  name: FieldSetting;
  phone: FieldSetting;
  gender: FieldSetting;
  date_of_birth: FieldSetting;
  address: FieldSetting;
  photo_id: FieldSetting;
  identity_proof_upload: FieldSetting;
  health_details: FieldSetting;
  medical_records_upload: FieldSetting;
  self_select_trainer: FieldSetting;
  daily_pass_enabled: FieldSetting;
}

const DEFAULT_FIELDS: RegistrationFields = {
  name: { enabled: true, required: true, locked: true },
  phone: { enabled: true, required: true, locked: true },
  gender: { enabled: true, required: true, locked: true },
  date_of_birth: { enabled: true, required: true, locked: true },
  address: { enabled: true, required: false, locked: false },
  photo_id: { enabled: true, required: false, locked: false },
  identity_proof_upload: { enabled: false, required: false, locked: false },
  health_details: { enabled: false, required: false, locked: false },
  medical_records_upload: { enabled: false, required: false, locked: false },
  self_select_trainer: { enabled: true, required: false, locked: false },
  daily_pass_enabled: { enabled: true, required: false, locked: false },
};

const FIELD_CONFIG = [
  // Personal Information
  { key: "name", label: "Full Name", description: "Member's full name", icon: User, section: "personal" },
  { key: "phone", label: "Phone Number", description: "10-digit mobile number", icon: Phone, section: "personal" },
  { key: "gender", label: "Gender", description: "Male / Female / Other", icon: User, section: "personal" },
  { key: "date_of_birth", label: "Date of Birth", description: "Member's date of birth", icon: Calendar, section: "personal" },
  { key: "address", label: "Address", description: "Residential address", icon: MapPin, section: "personal" },
  // Identity Verification
  { key: "photo_id", label: "Photo ID (Manual Entry)", description: "ID type dropdown and number input by user", icon: IdCard, section: "identity", group: "identity" },
  { key: "identity_proof_upload", label: "Identity Proof Upload", description: "Upload scan/photo of ID document (PDF/Image)", icon: Upload, section: "identity", group: "identity" },
  // Health & Medical
  { key: "health_details", label: "Health Details", description: "Blood group, height, weight, medical conditions, allergies, emergency contact", icon: Heart, section: "health" },
  { key: "medical_records_upload", label: "Medical Records Upload", description: "Upload medical certificates or health reports", icon: FileText, section: "health" },
  // Feature Controls
  { key: "self_select_trainer", label: "Member Self-Select Trainer", description: "Allow members to choose their own trainer during registration/renewal. If disabled, only admin can assign trainers.", icon: Dumbbell, section: "features" },
  { key: "daily_pass_enabled", label: "Daily Pass", description: "Enable daily pass system. When disabled, Daily Pass tab is hidden from dashboard and public pages.", icon: Clock, section: "features" },
];

const SECTION_HEADERS: Record<string, { title: string; subtitle?: string }> = {
  personal: { title: "Personal Information", subtitle: "Basic member details collected during registration" },
  identity: { title: "Identity Verification", subtitle: "Choose one verification method" },
  health: { title: "Health & Medical", subtitle: "Optional health information and document uploads" },
  features: { title: "Feature Controls", subtitle: "Toggle platform features for this branch" },
};

export const RegistrationFieldsSettings = () => {
  const { currentBranch } = useBranch();
  const [fields, setFields] = useState<RegistrationFields>(DEFAULT_FIELDS);
  const [originalFields, setOriginalFields] = useState<RegistrationFields>(DEFAULT_FIELDS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentBranch?.id) {
      fetchSettings();
    }
  }, [currentBranch?.id]);

  const fetchSettings = async () => {
    if (!currentBranch?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("gym_settings")
        .select("registration_field_settings")
        .eq("branch_id", currentBranch.id)
        .maybeSingle();

      if (error) throw error;
      if (data?.registration_field_settings) {
        const parsed = typeof data.registration_field_settings === "string"
          ? JSON.parse(data.registration_field_settings)
          : data.registration_field_settings;
        const merged = { ...DEFAULT_FIELDS, ...parsed };
        setFields(merged);
        setOriginalFields(merged);
      }
    } catch (err) {
      console.error("Error fetching registration field settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (key: string, type: "enabled" | "required", value: boolean) => {
    setFields(prev => {
      const updated = { ...prev };
      
      // Update the target field
      updated[key as keyof RegistrationFields] = {
        ...prev[key as keyof RegistrationFields],
        [type]: value,
        // If disabling, also unset required
        ...(type === "enabled" && !value ? { required: false } : {}),
      };
      
      // Mutual exclusivity: photo_id and identity_proof_upload
      if (type === "enabled" && value) {
        if (key === "photo_id") {
          updated.identity_proof_upload = { ...prev.identity_proof_upload, enabled: false, required: false };
        } else if (key === "identity_proof_upload") {
          updated.photo_id = { ...prev.photo_id, enabled: false, required: false };
        }
      }
      
      return updated;
    });
  };

  const hasChanges = JSON.stringify(fields) !== JSON.stringify(originalFields);

  const handleSave = async () => {
    if (!currentBranch?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("gym_settings")
        .update({ registration_field_settings: fields as any })
        .eq("branch_id", currentBranch.id);

      if (error) throw error;

      await logAdminActivity({
        category: "settings",
        type: "registration_fields_updated",
        description: `Updated registration field settings for ${currentBranch.name || "branch"}`,
        entityType: "gym_settings",
        entityName: currentBranch.name || "Gym Settings",
        oldValue: originalFields,
        newValue: fields,
        branchId: currentBranch.id,
      });

      setOriginalFields(fields);
      toast.success("Registration field settings saved");
    } catch (err: any) {
      toast.error("Error saving settings", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-border/40 shadow-sm">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-muted/50 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/40 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-accent/10 text-accent">
            <ClipboardDocumentListIcon className="w-4 h-4 lg:w-5 lg:h-5" />
          </div>
          <div>
            <CardTitle className="text-base lg:text-xl">Registration Form Fields</CardTitle>
            <CardDescription className="text-xs lg:text-sm">
              Choose which fields to show during member registration. Locked fields are always required.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 lg:p-6 pt-0 lg:pt-0 space-y-3">
        {FIELD_CONFIG.map(({ key, label, description, icon: Icon, group }: any) => {
          const field = fields[key as keyof RegistrationFields];
          const isLocked = field.locked;
          const isIdentityGroup = group === "identity";
          const otherIdentityEnabled = key === "photo_id" 
            ? fields.identity_proof_upload.enabled 
            : key === "identity_proof_upload" 
              ? fields.photo_id.enabled 
              : false;

          return (
            <div key={key}>
              {/* Show "Identity Verification" section header before first identity field */}
              {key === "photo_id" && (
                <div className="flex items-center gap-2 pt-2 pb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identity Verification</span>
                  <span className="text-[10px] text-muted-foreground">(choose one)</span>
                </div>
              )}
              <div
                className={`flex items-center justify-between p-3 lg:p-4 rounded-xl border transition-all duration-200 ${
                  field.enabled
                    ? "bg-accent/5 border-accent/20"
                    : "bg-muted/20 border-border/40"
                } ${isIdentityGroup ? "ml-2 border-l-2" : ""}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    field.enabled ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm truncate">{label}</p>
                      {isLocked && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] lg:text-xs text-muted-foreground truncate">{description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                  {!isLocked && field.enabled && key !== "daily_pass_enabled" && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-muted-foreground">Required</Label>
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => handleToggle(key, "required", v)}
                        className="scale-75"
                      />
                    </div>
                  )}
                  <Switch
                    checked={field.enabled}
                    onCheckedChange={(v) => handleToggle(key, "enabled", v)}
                    disabled={isLocked}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-3">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="w-full h-10 lg:h-11 text-sm lg:text-base rounded-xl"
          >
            {isSaving ? (
              <span className="flex items-center gap-2"><ButtonSpinner />Saving...</span>
            ) : "Save Field Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
