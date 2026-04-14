import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, Download, FileText, Upload, Heart } from "lucide-react";
import type { MemberDocument, HealthDetails } from "./MemberHealthTab";

interface HealthFilesSectionProps {
  documents: MemberDocument[];
  healthDetails: HealthDetails | null;
  memberId: string;
  onRefresh: () => void;
}

export const HealthFilesSection = ({ documents, healthDetails, memberId, onRefresh }: HealthFilesSectionProps) => {
  const [showUpload, setShowUpload] = useState(false);
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingHealth, setIsSavingHealth] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("medical_record");
  const [docNotes, setDocNotes] = useState("");

  const [healthForm, setHealthForm] = useState<HealthDetails>({
    blood_group: healthDetails?.blood_group || null,
    height_cm: healthDetails?.height_cm || null,
    weight_kg: healthDetails?.weight_kg || null,
    medical_conditions: healthDetails?.medical_conditions || null,
    allergies: healthDetails?.allergies || null,
    emergency_contact_name: healthDetails?.emergency_contact_name || null,
    emergency_contact_phone: healthDetails?.emergency_contact_phone || null,
  });

  const handleUpload = async () => {
    if (!file) { toast.error("Please select a file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10MB"); return; }
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${memberId}/${docType}/${Date.now()}.${ext}`;
      const { error: storageError } = await supabase.storage.from("member-documents").upload(path, file);
      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage.from("member-documents").getPublicUrl(path);

      const { error: dbError } = await supabase.from("member_documents").insert({
        member_id: memberId,
        document_type: docType,
        file_name: file.name,
        file_url: urlData.publicUrl || path,
        file_size: file.size,
        uploaded_by: docNotes || "Admin",
      });
      if (dbError) throw dbError;

      toast.success("Document uploaded");
      setFile(null);
      setDocNotes("");
      setShowUpload(false);
      onRefresh();
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveHealth = async () => {
    setIsSavingHealth(true);
    try {
      const { data: existing } = await supabase
        .from("member_details")
        .select("id")
        .eq("member_id", memberId)
        .maybeSingle();

      const updateData = {
        blood_group: healthForm.blood_group,
        height_cm: healthForm.height_cm,
        weight_kg: healthForm.weight_kg,
        medical_conditions: healthForm.medical_conditions,
        allergies: healthForm.allergies,
        emergency_contact_name: healthForm.emergency_contact_name,
        emergency_contact_phone: healthForm.emergency_contact_phone,
      };

      if (existing) {
        const { error } = await supabase.from("member_details").update(updateData).eq("member_id", memberId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("member_details").insert({ member_id: memberId, ...updateData });
        if (error) throw error;
      }

      toast.success("Health details saved");
      setShowHealthForm(false);
      onRefresh();
    } catch (err: any) {
      toast.error("Error saving health details", { description: err.message });
    } finally {
      setIsSavingHealth(false);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasHealthData = healthDetails && (healthDetails.blood_group || healthDetails.height_cm || healthDetails.weight_kg || healthDetails.medical_conditions || healthDetails.allergies || healthDetails.emergency_contact_name);

  return (
    <div className="space-y-4">
      {/* Health Details Card */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <Heart className="w-3 h-3" /> Health Details
          </h5>
          <Button variant="ghost" size="sm" onClick={() => setShowHealthForm(!showHealthForm)} className="h-6 text-xs px-2">
            {hasHealthData ? "Edit" : "Add"}
          </Button>
        </div>

        {showHealthForm ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px]">Blood Group</Label>
                <Select value={healthForm.blood_group || ""} onValueChange={v => setHealthForm(f => ({ ...f, blood_group: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Height (cm)</Label>
                <Input type="number" value={healthForm.height_cm || ""} onChange={e => setHealthForm(f => ({ ...f, height_cm: e.target.value ? Number(e.target.value) : null }))} className="h-8 text-xs mt-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">Weight (kg)</Label>
                <Input type="number" value={healthForm.weight_kg || ""} onChange={e => setHealthForm(f => ({ ...f, weight_kg: e.target.value ? Number(e.target.value) : null }))} className="h-8 text-xs mt-0.5" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Medical Conditions</Label>
              <Textarea value={healthForm.medical_conditions || ""} onChange={e => setHealthForm(f => ({ ...f, medical_conditions: e.target.value }))} className="text-xs min-h-[50px] mt-0.5" placeholder="Any conditions..." />
            </div>
            <div>
              <Label className="text-[10px]">Allergies</Label>
              <Input value={healthForm.allergies || ""} onChange={e => setHealthForm(f => ({ ...f, allergies: e.target.value }))} className="h-8 text-xs mt-0.5" placeholder="Known allergies..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Emergency Contact</Label>
                <Input value={healthForm.emergency_contact_name || ""} onChange={e => setHealthForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className="h-8 text-xs mt-0.5" placeholder="Name" />
              </div>
              <div>
                <Label className="text-[10px]">Emergency Phone</Label>
                <Input value={healthForm.emergency_contact_phone || ""} onChange={e => setHealthForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className="h-8 text-xs mt-0.5" placeholder="Phone" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveHealth} disabled={isSavingHealth} className="flex-1 rounded-lg">
                {isSavingHealth ? <><ButtonSpinner /> Saving...</> : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowHealthForm(false)} className="rounded-lg">Cancel</Button>
            </div>
          </div>
        ) : hasHealthData ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {healthDetails.blood_group && <div><span className="text-muted-foreground">Blood: </span><span className="font-medium">{healthDetails.blood_group}</span></div>}
            {healthDetails.height_cm && <div><span className="text-muted-foreground">Height: </span><span className="font-medium">{healthDetails.height_cm} cm</span></div>}
            {healthDetails.weight_kg && <div><span className="text-muted-foreground">Weight: </span><span className="font-medium">{healthDetails.weight_kg} kg</span></div>}
            {healthDetails.medical_conditions && <div className="col-span-2"><span className="text-muted-foreground">Conditions: </span><span className="font-medium">{healthDetails.medical_conditions}</span></div>}
            {healthDetails.allergies && <div className="col-span-2"><span className="text-muted-foreground">Allergies: </span><span className="font-medium">{healthDetails.allergies}</span></div>}
            {healthDetails.emergency_contact_name && <div className="col-span-2"><span className="text-muted-foreground">Emergency: </span><span className="font-medium">{healthDetails.emergency_contact_name} ({healthDetails.emergency_contact_phone})</span></div>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No health details added yet</p>
        )}
      </div>

      {/* Documents Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Documents</h5>
          <Button variant="outline" size="sm" onClick={() => setShowUpload(!showUpload)} className="h-6 text-xs px-2 rounded-lg">
            <Upload className="w-3 h-3 mr-1" /> Upload
          </Button>
        </div>

        {showUpload && (
          <div className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-3 mb-3">
            <div>
              <Label className="text-xs">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="identity_proof">Identity Proof</SelectItem>
                  <SelectItem value="medical_record">Medical Record</SelectItem>
                  <SelectItem value="medical_certificate">Medical Certificate</SelectItem>
                  <SelectItem value="health_report">Health Report</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">File (PDF, Image, DOC, ZIP — max 10MB)</Label>
              <Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.zip" className="h-8 text-xs mt-0.5" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder="Who uploaded, reason..." className="h-8 text-xs mt-0.5" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpload} disabled={isUploading} className="flex-1 rounded-lg">
                {isUploading ? <><ButtonSpinner /> Uploading...</> : "Upload"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowUpload(false)} className="rounded-lg">Cancel</Button>
            </div>
          </div>
        )}

        {documents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No documents uploaded yet</p>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 p-2.5 hover:border-border transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/80 flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{doc.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.document_type.replace(/_/g, " ")} • {formatDate(doc.created_at)}
                      {doc.file_size ? ` • ${formatSize(doc.file_size)}` : ""}
                    </p>
                  </div>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
