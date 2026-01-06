import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, IdCard, MapPin, User } from "lucide-react";

interface MemberDetailsFormProps {
  onSubmit: (data: MemberDetailsData) => void;
  onBack: () => void;
}

export interface MemberDetailsData {
  fullName: string;
  photoIdType: string;
  photoIdNumber: string;
  address: string;
  gender: string;
}

const MemberDetailsForm = ({ onSubmit, onBack }: MemberDetailsFormProps) => {
  const [fullName, setFullName] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [gender, setGender] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      fullName,
      photoIdType,
      photoIdNumber,
      address,
      gender,
    });
  };

  const formatIdNumber = (value: string, type: string) => {
    // Remove all non-alphanumeric characters
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    
    if (type === "aadhaar") {
      // Format: XXXX XXXX XXXX
      return cleaned.slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
    } else if (type === "pan") {
      // Format: AAAAA9999A (10 chars)
      return cleaned.slice(0, 10);
    } else if (type === "voter") {
      // Format: ABC1234567 (10 chars)
      return cleaned.slice(0, 10);
    }
    return cleaned;
  };

  return (
    <Card className="max-w-md mx-auto border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Personal Details</CardTitle>
        <CardDescription>
          Please provide your details for registration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              Full Name
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              required
              autoComplete="name"
            />
          </div>

          {/* Gender */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              Gender
            </Label>
            <RadioGroup value={gender} onValueChange={setGender} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male" className="cursor-pointer">Male</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female" className="cursor-pointer">Female</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="cursor-pointer">Other</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Photo ID Type */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <IdCard className="w-4 h-4 text-accent" />
              Photo ID Type
            </Label>
            <Select value={photoIdType} onValueChange={setPhotoIdType}>
              <SelectTrigger>
                <SelectValue placeholder="Select ID type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                <SelectItem value="pan">PAN Card</SelectItem>
                <SelectItem value="voter">Voter ID</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Photo ID Number */}
          {photoIdType && (
            <div className="space-y-2">
              <Label>
                {photoIdType === "aadhaar" && "Aadhaar Number"}
                {photoIdType === "pan" && "PAN Number"}
                {photoIdType === "voter" && "Voter ID Number"}
              </Label>
              <Input
                value={photoIdNumber}
                onChange={(e) => setPhotoIdNumber(formatIdNumber(e.target.value, photoIdType))}
                placeholder={
                  photoIdType === "aadhaar" ? "1234 5678 9012" :
                  photoIdType === "pan" ? "ABCDE1234F" :
                  "ABC1234567"
                }
                required
              />
            </div>
          )}

          {/* Address */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Address
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your full address"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button 
              type="submit" 
              variant="accent" 
              className="flex-1"
              disabled={!fullName || !gender || !photoIdType || !photoIdNumber || !address}
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

export default MemberDetailsForm;
