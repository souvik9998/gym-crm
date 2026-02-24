import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowRight, IdCard, MapPin, User, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ValidatedInput, InlineError } from "@/components/ui/validated-input";
import {
  memberDetailsSchema,
  getPhotoIdSchema,
  validateField,
  validateForm,
  nameSchema,
  addressSchema,
  sanitize,
  type FieldErrors,
} from "@/lib/validation";

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
  dateOfBirth?: string;
}

const MemberDetailsForm = ({ onSubmit, onBack }: MemberDetailsFormProps) => {
  const [fullName, setFullName] = useState("");
  const [photoIdType, setPhotoIdType] = useState("");
  const [photoIdNumber, setPhotoIdNumber] = useState("");
  const [address, setAddress] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateSingleField = useCallback(
    (field: string, value: string) => {
      let error: string | undefined;
      switch (field) {
        case "fullName":
          error = validateField(nameSchema, value);
          break;
        case "photoIdNumber":
          if (photoIdType) {
            error = validateField(getPhotoIdSchema(photoIdType), value);
          }
          break;
        case "address":
          error = validateField(addressSchema, value);
          break;
      }
      setErrors((prev) => ({ ...prev, [field]: error }));
    },
    [photoIdType]
  );

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Sanitize inputs
    const sanitizedName = sanitize(fullName);
    const sanitizedAddress = sanitize(address);

    const result = validateForm(memberDetailsSchema, {
      fullName: sanitizedName,
      gender,
      photoIdType,
      photoIdNumber,
      address: sanitizedAddress,
    });

    if (!result.success) {
      setErrors(result.errors);
      // Mark all as touched to show errors
      setTouched({ fullName: true, gender: true, photoIdType: true, photoIdNumber: true, address: true });
      return;
    }

    // Additional photo ID validation
    if (photoIdType) {
      const idError = validateField(getPhotoIdSchema(photoIdType), photoIdNumber);
      if (idError) {
        setErrors((prev) => ({ ...prev, photoIdNumber: idError }));
        setTouched((prev) => ({ ...prev, photoIdNumber: true }));
        return;
      }
    }

    onSubmit({
      fullName: sanitizedName,
      photoIdType,
      photoIdNumber: photoIdNumber.replace(/\s/g, ""),
      address: sanitizedAddress,
      gender,
      dateOfBirth: dateOfBirth ? format(dateOfBirth, "yyyy-MM-dd") : undefined,
    });
  };

  const formatIdNumber = (value: string, type: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (type === "aadhaar") {
      return cleaned.slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
    } else if (type === "pan") {
      return cleaned.slice(0, 10);
    } else if (type === "voter") {
      return cleaned.slice(0, 10);
    }
    return cleaned;
  };

  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 10);
  const minDobDate = new Date();
  minDobDate.setFullYear(minDobDate.getFullYear() - 100);

  const isFormValid =
    fullName.trim().length >= 2 &&
    gender !== "" &&
    photoIdType !== "" &&
    photoIdNumber.trim().length > 0 &&
    address.trim().length >= 3;

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
              Full Name *
            </Label>
            <ValidatedInput
              value={fullName}
              onChange={(e) => {
                // Only allow letters, spaces, dots, apostrophes
                const val = e.target.value.replace(/[^a-zA-Z\s.']/g, "");
                setFullName(val);
                if (touched.fullName) validateSingleField("fullName", val);
              }}
              onValidate={(v) => {
                markTouched("fullName");
                validateSingleField("fullName", v);
              }}
              placeholder="Enter your full name"
              error={touched.fullName ? errors.fullName : undefined}
              autoComplete="name"
            />
          </div>

          {/* Gender */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">Gender *</Label>
            <RadioGroup
              value={gender}
              onValueChange={(v) => {
                setGender(v);
                setErrors((prev) => ({ ...prev, gender: undefined }));
              }}
              className="flex gap-4"
            >
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
            <InlineError message={touched.gender && !gender ? errors.gender : undefined} />
          </div>

          {/* Date of Birth */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-accent" />
              Date of Birth
            </Label>
            <Popover open={showDobPicker} onOpenChange={setShowDobPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateOfBirth ? format(dateOfBirth, "dd MMM yyyy") : "Select date of birth"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateOfBirth}
                  onSelect={(date) => {
                    setDateOfBirth(date);
                    setShowDobPicker(false);
                  }}
                  disabled={(date) => date > maxDobDate || date < minDobDate}
                  defaultMonth={dateOfBirth || new Date(2000, 0, 1)}
                  captionLayout="dropdown-buttons"
                  fromYear={1925}
                  toYear={maxDobDate.getFullYear()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Photo ID Type */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <IdCard className="w-4 h-4 text-accent" />
              Photo ID Type *
            </Label>
            <Select
              value={photoIdType}
              onValueChange={(v) => {
                setPhotoIdType(v);
                setPhotoIdNumber("");
                setErrors((prev) => ({ ...prev, photoIdType: undefined, photoIdNumber: undefined }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select ID type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aadhaar">Aadhaar Card</SelectItem>
                <SelectItem value="pan">PAN Card</SelectItem>
                <SelectItem value="voter">Voter ID</SelectItem>
              </SelectContent>
            </Select>
            <InlineError message={touched.photoIdType && !photoIdType ? errors.photoIdType : undefined} />
          </div>

          {/* Photo ID Number */}
          {photoIdType && (
            <div className="space-y-2">
              <Label>
                {photoIdType === "aadhaar" && "Aadhaar Number *"}
                {photoIdType === "pan" && "PAN Number *"}
                {photoIdType === "voter" && "Voter ID Number *"}
              </Label>
              <ValidatedInput
                value={photoIdNumber}
                onChange={(e) => {
                  const formatted = formatIdNumber(e.target.value, photoIdType);
                  setPhotoIdNumber(formatted);
                  if (touched.photoIdNumber) validateSingleField("photoIdNumber", formatted);
                }}
                onValidate={(v) => {
                  markTouched("photoIdNumber");
                  validateSingleField("photoIdNumber", v);
                }}
                placeholder={
                  photoIdType === "aadhaar" ? "1234 5678 9012" :
                  photoIdType === "pan" ? "ABCDE1234F" :
                  "ABC1234567"
                }
                error={touched.photoIdNumber ? errors.photoIdNumber : undefined}
              />
            </div>
          )}

          {/* Address */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Address *
            </Label>
            <ValidatedInput
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (touched.address) validateSingleField("address", e.target.value);
              }}
              onValidate={(v) => {
                markTouched("address");
                validateSingleField("address", v);
              }}
              placeholder="Enter your full address"
              error={touched.address ? errors.address : undefined}
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
              disabled={!isFormValid}
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
