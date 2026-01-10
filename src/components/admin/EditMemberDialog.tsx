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

      if (data) {
        setGender(data.gender || "");
        setPhotoIdType(data.photo_id_type || "");
        setPhotoIdNumber(data.photo_id_number || "");
        setAddress(data.address || "");
      } else {
        // Reset fields if no details exist
        setGender("");
        setPhotoIdType("");
        setPhotoIdNumber("");
        setAddress("");
      }
    } catch (error: any) {
      console.error("Error fetching member details:", error);
    }
  };

  const handleSaveMember = async () => {
    if (!member) return;
    setIsLoading(true);

    try {
      // Update basic member info
      const { error: memberError } = await supabase
        .from("members")
        .update({ name, phone })
        .eq("id", member.id);

      if (memberError) throw memberError;

      // Check if member_details exists
      const { data: existingDetails } = await supabase
        .from("member_details")
        .select("id")
        .eq("member_id", member.id)
        .maybeSingle();

      const detailsData = {
        gender: gender || null,
        photo_id_type: photoIdType || null,
        photo_id_number: photoIdNumber || null,
        address: address || null,
      };

      if (existingDetails) {
        // Update existing details
        const { error: detailsError } = await supabase
          .from("member_details")
          .update(detailsData)
          .eq("member_id", member.id);

        if (detailsError) throw detailsError;
      } else {
        // Insert new details
        const { error: detailsError } = await supabase
          .from("member_details")
          .insert({
            member_id: member.id,
            ...detailsData,
          });

        if (detailsError) throw detailsError;
      }

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
