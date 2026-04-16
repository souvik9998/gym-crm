import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Heart, Upload, FileText, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface HealthDetailsData {
  bloodGroup?: string;
  heightCm?: number;
  weightKg?: number;
  medicalConditions?: string;
  allergies?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContact2Name?: string;
  emergencyContact2Phone?: string;
  identityProofFiles?: UploadedFile[];
  medicalRecordFiles?: UploadedFile[];
}

export interface UploadedFile {
  name: string;
  url: string;
  size: number;
}

interface HealthDetailsFormProps {
  onSubmit: (data: HealthDetailsData) => void;
  onBack: () => void;
  initialData?: HealthDetailsData | null;
  showHealthDetails: boolean;
  showIdentityUpload: boolean;
  showMedicalUpload: boolean;
  showBloodGroup?: boolean;
  bloodGroupRequired?: boolean;
  showEmergencyContact1?: boolean;
  emergencyContact1Required?: boolean;
  showEmergencyContact2?: boolean;
  emergencyContact2Required?: boolean;
  healthRequired: boolean;
  identityRequired: boolean;
  medicalRequired: boolean;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const HealthDetailsForm = ({
  onSubmit,
  onBack,
  initialData,
  showHealthDetails,
  showIdentityUpload,
  showMedicalUpload,
  showBloodGroup = false,
  bloodGroupRequired = false,
  showEmergencyContact1 = false,
  emergencyContact1Required = false,
  showEmergencyContact2 = false,
  emergencyContact2Required = false,
  healthRequired,
  identityRequired,
  medicalRequired,
}: HealthDetailsFormProps) => {
  const [bloodGroup, setBloodGroup] = useState(initialData?.bloodGroup || "");
  const [heightCm, setHeightCm] = useState(initialData?.heightCm?.toString() || "");
  const [weightKg, setWeightKg] = useState(initialData?.weightKg?.toString() || "");
  const [medicalConditions, setMedicalConditions] = useState(initialData?.medicalConditions || "");
  const [allergies, setAllergies] = useState(initialData?.allergies || "");
  const [emergencyContactName, setEmergencyContactName] = useState(initialData?.emergencyContactName || "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(initialData?.emergencyContactPhone || "");
  const [emergency2Name, setEmergency2Name] = useState(initialData?.emergencyContact2Name || "");
  const [emergency2Phone, setEmergency2Phone] = useState(initialData?.emergencyContact2Phone || "");
  
  const [identityFiles, setIdentityFiles] = useState<UploadedFile[]>(initialData?.identityProofFiles || []);
  const [medicalFiles, setMedicalFiles] = useState<UploadedFile[]>(initialData?.medicalRecordFiles || []);
  const [isUploading, setIsUploading] = useState(false);
  
  const identityInputRef = useRef<HTMLInputElement>(null);
  const medicalInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File, type: "identity" | "medical") => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum file size is 5MB" });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type", { description: "Only JPG, PNG, WebP, and PDF are allowed" });
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${type}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      
      const { error } = await supabase.storage
        .from("member-documents")
        .upload(path, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("member-documents")
        .getPublicUrl(path);

      const uploadedFile: UploadedFile = {
        name: file.name,
        url: publicUrl,
        size: file.size,
      };

      if (type === "identity") {
        setIdentityFiles(prev => [...prev, uploadedFile]);
      } else {
        setMedicalFiles(prev => [...prev, uploadedFile]);
      }
      
      toast.success("File uploaded successfully");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (type: "identity" | "medical", index: number) => {
    if (type === "identity") {
      setIdentityFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setMedicalFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const isValid = () => {
    if (healthRequired && showHealthDetails) {
      if (!bloodGroup || !emergencyContactName || !emergencyContactPhone) return false;
    }
    if (identityRequired && showIdentityUpload && identityFiles.length === 0) return false;
    if (medicalRequired && showMedicalUpload && medicalFiles.length === 0) return false;
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid()) {
      toast.error("Please fill all required fields");
      return;
    }
    onSubmit({
      bloodGroup: bloodGroup || undefined,
      heightCm: heightCm ? Number(heightCm) : undefined,
      weightKg: weightKg ? Number(weightKg) : undefined,
      medicalConditions: medicalConditions || undefined,
      allergies: allergies || undefined,
      emergencyContactName: emergencyContactName || undefined,
      emergencyContactPhone: emergencyContactPhone || undefined,
      identityProofFiles: identityFiles.length > 0 ? identityFiles : undefined,
      medicalRecordFiles: medicalFiles.length > 0 ? medicalFiles : undefined,
    });
  };

  const FileUploadSection = ({
    title,
    description,
    files,
    onRemove,
    onUpload,
    inputRef,
    required,
  }: {
    title: string;
    description: string;
    files: UploadedFile[];
    onRemove: (i: number) => void;
    onUpload: (f: File) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    required: boolean;
  }) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Upload className="w-4 h-4 text-accent" />
        {title} {required && "*"}
      </Label>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      
      {files.map((file, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
          <FileText className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="truncate flex-1">{file.name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {(file.size / 1024).toFixed(0)}KB
          </span>
          <button type="button" onClick={() => onRemove(i)} className="text-destructive hover:text-destructive/80">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading || files.length >= 3}
        className="w-full"
      >
        {isUploading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
        ) : (
          <><Upload className="w-4 h-4 mr-2" />Choose File (Max 5MB)</>
        )}
      </Button>
    </div>
  );

  return (
    <Card className="max-w-md mx-auto border animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Heart className="w-5 h-5 text-accent" />
          Health & Documents
        </CardTitle>
        <CardDescription>
          Provide health information and upload required documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identity Proof Upload */}
          {showIdentityUpload && (
            <div className="animate-fade-in" style={{ animationDelay: "50ms" }}>
              <FileUploadSection
                title="Identity Proof"
                description="Upload scan/photo of your Aadhaar, PAN, or other ID"
                files={identityFiles}
                onRemove={(i) => removeFile("identity", i)}
                onUpload={(f) => handleFileUpload(f, "identity")}
                inputRef={identityInputRef as React.RefObject<HTMLInputElement>}
                required={identityRequired}
              />
            </div>
          )}

          {/* Health Details */}
          {showHealthDetails && (
            <div className="space-y-4 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Blood Group {healthRequired && "*"}</Label>
                  <Select value={bloodGroup} onValueChange={setBloodGroup}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map(bg => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Height (cm)</Label>
                  <Input
                    type="number"
                    min="50"
                    max="250"
                    value={heightCm}
                    onChange={e => setHeightCm(e.target.value)}
                    placeholder="170"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Weight (kg)</Label>
                  <Input
                    type="number"
                    min="20"
                    max="300"
                    value={weightKg}
                    onChange={e => setWeightKg(e.target.value)}
                    placeholder="70"
                    className="h-10 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Medical Conditions</Label>
                <Textarea
                  value={medicalConditions}
                  onChange={e => setMedicalConditions(e.target.value)}
                  placeholder="Any existing medical conditions (e.g., diabetes, asthma)"
                  className="min-h-[60px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Allergies</Label>
                <Input
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                  placeholder="Any known allergies"
                  className="h-10 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Emergency Contact {healthRequired && "*"}</Label>
                  <Input
                    value={emergencyContactName}
                    onChange={e => setEmergencyContactName(e.target.value)}
                    placeholder="Contact name"
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Emergency Phone {healthRequired && "*"}</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-2 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-xs">
                      +91
                    </span>
                    <Input
                      value={emergencyContactPhone}
                      onChange={e => setEmergencyContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Phone"
                      className="flex-1 rounded-l-none h-10 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Medical Records Upload */}
          {showMedicalUpload && (
            <div className="animate-fade-in" style={{ animationDelay: "150ms" }}>
              <FileUploadSection
                title="Medical Records"
                description="Upload medical certificates, health reports, or fitness certificates"
                files={medicalFiles}
                onRemove={(i) => removeFile("medical", i)}
                onUpload={(f) => handleFileUpload(f, "medical")}
                inputRef={medicalInputRef as React.RefObject<HTMLInputElement>}
                required={medicalRequired}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button
              type="submit"
              variant="accent"
              className="flex-1"
              disabled={!isValid() || isUploading}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default HealthDetailsForm;
