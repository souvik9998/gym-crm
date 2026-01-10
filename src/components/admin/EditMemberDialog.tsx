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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { Calendar, User, Phone, Save, MapPin, CreditCard, Users } from "lucide-react";

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

interface MemberDetails {
  gender: string | null;
  photo_id_type: string | null;
  photo_id_number: string | null;
  address: string | null;
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
  
  // Additional member details
  const [gender, setGender] = useState<string>("");
  const [photoIdType, setPhotoIdType] = useState<string>("");
  const [photoIdNumber, setPhotoIdNumber] = useState<string>("");
  const [address, setAddress] = useState<string>("");

  // Original values to track changes
  const [originalValues, setOriginalValues] = useState<{
    name: string;
    phone: string;
    gender: string;
    photoIdType: string;
    photoIdNumber: string;
    address: string;
  } | null>(null);

  useEffect(() => {
    if (member) {
      setName(member.name);
      setPhone(member.phone);
      fetchMemberDetails(member.id);
    }
  }, [member]);

  const fetchMemberDetails = async (memberId: string) => {
    try {
      const { data, error } = await supabase
        .from("member_details")
        .select("gender, photo_id_type, photo_id_number, address")
        .eq("member_id", memberId)
        .maybeSingle();

      if (error) throw error;

      const fetchedGender = data?.gender || "";
      const fetchedPhotoIdType = data?.photo_id_type || "";
      const fetchedPhotoIdNumber = data?.photo_id_number || "";
      const fetchedAddress = data?.address || "";

      setGender(fetchedGender);
      setPhotoIdType(fetchedPhotoIdType);
      setPhotoIdNumber(fetchedPhotoIdNumber);
      setAddress(fetchedAddress);

      // Store original values for comparison
      setOriginalValues({
        name: member?.name || "",
        phone: member?.phone || "",
        gender: fetchedGender,
        photoIdType: fetchedPhotoIdType,
        photoIdNumber: fetchedPhotoIdNumber,
        address: fetchedAddress,
      });
    } catch (error: any) {
      console.error("Error fetching member details:", error);
      // Still set original values even on error
      setOriginalValues({
        name: member?.name || "",
        phone: member?.phone || "",
        gender: "",
        photoIdType: "",
        photoIdNumber: "",
        address: "",
      });
    }
  };

  const handleSaveMember = async () => {
    if (!member || !originalValues) return;
    setIsLoading(true);

    try {
      // Track what's changed
      const changes: Record<string, { old: any; new: any }> = {};
      const memberUpdates: Record<string, any> = {};
      const detailUpdates: Record<string, any> = {};

      // Check member table fields
      if (name !== originalValues.name) {
        changes.name = { old: originalValues.name, new: name };
        memberUpdates.name = name;
      }
      if (phone !== originalValues.phone) {
        changes.phone = { old: originalValues.phone, new: phone };
        memberUpdates.phone = phone;
      }

      // Check member_details fields
      if (gender !== originalValues.gender) {
        changes.gender = { old: originalValues.gender || "Not set", new: gender || "Not set" };
        detailUpdates.gender = gender || null;
      }
      if (photoIdType !== originalValues.photoIdType) {
        changes.photo_id_type = { old: originalValues.photoIdType || "Not set", new: photoIdType || "Not set" };
        detailUpdates.photo_id_type = photoIdType || null;
      }
      if (photoIdNumber !== originalValues.photoIdNumber) {
        changes.photo_id_number = { old: originalValues.photoIdNumber || "Not set", new: photoIdNumber || "Not set" };
        detailUpdates.photo_id_number = photoIdNumber || null;
      }
      if (address !== originalValues.address) {
        changes.address = { old: originalValues.address || "Not set", new: address || "Not set" };
        detailUpdates.address = address || null;
      }

      // Only update if there are changes
      if (Object.keys(changes).length === 0) {
        toast({ title: "No changes to save" });
        setIsLoading(false);
        return;
      }

      // Update member table if needed
      if (Object.keys(memberUpdates).length > 0) {
        const { error: memberError } = await supabase
          .from("members")
          .update(memberUpdates)
          .eq("id", member.id);

        if (memberError) throw memberError;
      }

      // Update member_details if needed
      if (Object.keys(detailUpdates).length > 0) {
        const { data: existingDetails } = await supabase
          .from("member_details")
          .select("id")
          .eq("member_id", member.id)
          .maybeSingle();

        if (existingDetails) {
          const { error: detailsError } = await supabase
            .from("member_details")
            .update(detailUpdates)
            .eq("member_id", member.id);

          if (detailsError) throw detailsError;
        } else {
          const { error: detailsError } = await supabase
            .from("member_details")
            .insert({
              member_id: member.id,
              gender: gender || null,
              photo_id_type: photoIdType || null,
              photo_id_number: photoIdNumber || null,
              address: address || null,
            });

          if (detailsError) throw detailsError;
        }
      }

      // Build old and new value objects for logging
      const oldValue: Record<string, any> = {};
      const newValue: Record<string, any> = {};
      Object.entries(changes).forEach(([key, value]) => {
        oldValue[key] = value.old;
        newValue[key] = value.new;
      });

      const changedFields = Object.keys(changes).map(key => 
        key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      ).join(", ");

      await logAdminActivity({
        category: "members",
        type: "member_updated",
        description: `Updated ${changedFields} for "${name}"`,
        entityType: "members",
        entityId: member.id,
        entityName: name,
        oldValue,
        newValue,
      });

      toast({ title: "Member updated successfully", description: `Changed: ${changedFields}` });
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Edit Member
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Contact Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              Contact Information
            </h4>
            <div className="space-y-3">
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
            </div>
          </div>

          {/* Personal Details */}
          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4" />
              Personal Details
            </h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="photoIdType">Photo ID Type</Label>
                <Select value={photoIdType} onValueChange={setPhotoIdType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aadhar">Aadhar Card</SelectItem>
                    <SelectItem value="pan">PAN Card</SelectItem>
                    <SelectItem value="driving">Driving License</SelectItem>
                    <SelectItem value="voter">Voter ID</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="photoIdNumber">ID Number</Label>
                <Input
                  id="photoIdNumber"
                  value={photoIdNumber}
                  onChange={(e) => setPhotoIdNumber(e.target.value)}
                  placeholder="Enter ID number"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="border-t pt-4 space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              Address
            </h4>
            <div className="space-y-2">
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter full address"
                className="min-h-[80px]"
              />
            </div>
          </div>

          {/* Subscription Info (Read-only) */}
          {member.subscription && (
            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                Subscription
              </h4>
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
              <p className="text-xs text-muted-foreground">
                To extend membership, use the Renew page or Add Payment option.
              </p>
            </div>
          )}

          <Button
            onClick={handleSaveMember}
            disabled={isLoading || !name || phone.length !== 10}
            className="w-full"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
