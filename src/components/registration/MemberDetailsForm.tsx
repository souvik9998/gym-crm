import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DobInput } from "@/components/ui/dob-input";
import { ArrowRight, IdCard, MapPin, User, CalendarDays, Mail, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ValidatedInput, InlineError } from "@/components/ui/validated-input";
import {
  getPhotoIdSchema,
  validateField,
  nameSchema,
  addressSchema,
  sanitize,
  type FieldErrors,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

interface MemberDetailsFormProps {
  onSubmit: (data: MemberDetailsData) => void;
  onBack: () => void;
  initialData?: MemberDetailsData | null;
  showPhotoId?: boolean;
  photoIdRequired?: boolean;
  showEmail?: boolean;
  emailRequired?: boolean;
  showOccupation?: boolean;
  occupationRequired?: boolean;
  showAddress?: boolean;
  addressRequired?: boolean;
  showDateOfBirth?: boolean;
  dateOfBirthRequired?: boolean;
}

export interface MemberDetailsData {
  fullName: string;
  photoIdType: string;
  photoIdNumber: string;
  address: string;
  gender: string;
  dateOfBirth?: string;
  email?: string;
  occupation?: string;
}

const STORAGE_KEY = "member-details-form";

const MemberDetailsForm = ({ onSubmit, onBack, initialData, showPhotoId = true, photoIdRequired = false, showEmail = false, emailRequired = false, showOccupation = false, occupationRequired = false, showAddress = true, addressRequired = true, showDateOfBirth = true, dateOfBirthRequired = true }: MemberDetailsFormProps) => {
  const { branchId } = useParams<{ branchId?: string }>();
  const storageKey = `${STORAGE_KEY}-${branchId || "default"}`;

  // Restore from initialData (passed from parent) or sessionStorage
  const getInitial = () => {
    if (initialData) return initialData;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as MemberDetailsData;
    } catch {}
    return null;
  };

  const initial = getInitial();

  const [fullName, setFullName] = useState(initial?.fullName || "");
  const [photoIdType, setPhotoIdType] = useState(initial?.photoIdType || "");
  const [photoIdNumber, setPhotoIdNumber] = useState(initial?.photoIdNumber || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [gender, setGender] = useState(initial?.gender || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [occupation, setOccupation] = useState(initial?.occupation || "");
  const [dateOfBirth, setDateOfBirth] = useState<string | undefined>(
    initial?.dateOfBirth || undefined
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Persist to sessionStorage on change
  useEffect(() => {
    const data: MemberDetailsData = {
      fullName,
      photoIdType,
      photoIdNumber,
      address,
      gender,
      dateOfBirth: dateOfBirth || undefined,
      email: email || undefined,
      occupation: occupation || undefined,
    };
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  }, [fullName, photoIdType, photoIdNumber, address, gender, dateOfBirth, email, occupation, storageKey]);

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

    const sanitizedName = sanitize(fullName);
    const sanitizedAddress = sanitize(address);

    const newErrors: FieldErrors = {};
    const newTouched: Record<string, boolean> = { fullName: true, gender: true };

    // Name (always required - locked)
    const nameErr = validateField(nameSchema, sanitizedName);
    if (nameErr) newErrors.fullName = nameErr;

    // Gender (always required - locked)
    if (!gender) newErrors.gender = "Gender is required";

    // Address (conditional)
    if (showAddress && addressRequired) {
      newTouched.address = true;
      const addrErr = validateField(addressSchema, sanitizedAddress);
      if (addrErr) newErrors.address = addrErr;
    }

    // DOB (conditional)
    if (showDateOfBirth) {
      newTouched.dateOfBirth = true;
      if (dateOfBirthRequired && !dateOfBirth) {
        newErrors.dateOfBirth = "Date of birth is required";
      } else if (dateOfBirth) {
        const [y, m, d] = dateOfBirth.split("-").map((s) => parseInt(s, 10));
        const maxYear = new Date().getFullYear() - 10;
        if (!y || !m || !d) {
          newErrors.dateOfBirth = "Enter a valid date in DD/MM/YYYY format";
        } else if (y < 1925) {
          newErrors.dateOfBirth = "Year must be 1925 or later";
        } else if (y > maxYear) {
          newErrors.dateOfBirth = "You must be at least 10 years old";
        }
      }
    }

    // Email (conditional)
    if (showEmail && emailRequired) {
      newTouched.email = true;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        newErrors.email = "Valid email is required";
      }
    }

    // Occupation (conditional)
    if (showOccupation && occupationRequired && !occupation.trim()) {
      newTouched.occupation = true;
      newErrors.occupation = "Occupation is required";
    }

    // Photo ID (conditional)
    if (showPhotoId && photoIdRequired) {
      newTouched.photoIdType = true;
      newTouched.photoIdNumber = true;
      if (!photoIdType) {
        newErrors.photoIdType = "Photo ID type is required";
      } else {
        const idError = validateField(getPhotoIdSchema(photoIdType), photoIdNumber);
        if (idError) newErrors.photoIdNumber = idError;
      }
    } else if (showPhotoId && photoIdType) {
      // Optional but user picked a type — still validate the number they entered
      const idError = validateField(getPhotoIdSchema(photoIdType), photoIdNumber);
      if (idError) {
        newErrors.photoIdNumber = idError;
        newTouched.photoIdNumber = true;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTouched((prev) => ({ ...prev, ...newTouched }));
      return;
    }

    onSubmit({
      fullName: sanitizedName,
      photoIdType,
      photoIdNumber: photoIdNumber.replace(/\s/g, ""),
      address: sanitizedAddress,
      gender,
      dateOfBirth: dateOfBirth || undefined,
      email: email || undefined,
      occupation: occupation || undefined,
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




  const emailIsValidShape = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isFormValid =
    fullName.trim().length >= 2 &&
    gender !== "" &&
    (!showPhotoId || !photoIdRequired || (photoIdType !== "" && photoIdNumber.trim().length > 0)) &&
    (!showAddress || !addressRequired || address.trim().length >= 3) &&
    (!showDateOfBirth || !dateOfBirthRequired || !!dateOfBirth) &&
    (!showEmail || !emailRequired || (!!email && emailIsValidShape)) &&
    emailIsValidShape &&
    (!showOccupation || !occupationRequired || occupation.trim().length > 0);

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
  ];

  return (
    <Card className="max-w-md mx-auto border animate-fade-in">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Personal Details</CardTitle>
        <CardDescription>
          Please provide your details for registration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name */}
          <div className="space-y-2 animate-fade-in" style={{ animationDelay: "50ms" }}>
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              Full Name *
            </Label>
            <ValidatedInput
              value={fullName}
              onChange={(e) => {
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

          {/* Gender - pill-style selector */}
          <div className="space-y-3 animate-fade-in" style={{ animationDelay: "100ms" }}>
            <Label className="flex items-center gap-2">Gender *</Label>
            <div className="flex gap-2">
              {genderOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setGender(opt.value);
                    setErrors((prev) => ({ ...prev, gender: undefined }));
                  }}
                  className={cn(
                    "flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-200",
                    gender === opt.value
                      ? "border-accent bg-accent/10 text-accent scale-[1.02] shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:bg-accent/5"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <InlineError message={touched.gender && !gender ? errors.gender : undefined} />
          </div>

          {/* Date of Birth */}
          {showDateOfBirth && (
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: "150ms" }}>
              <Label className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-accent" />
                Date of Birth {dateOfBirthRequired ? "*" : ""}
              </Label>
              <DobInput
                value={dateOfBirth}
                onChange={setDateOfBirth}
                error={touched.dateOfBirth ? errors.dateOfBirth : undefined}
              />
            </div>
          )}

          {/* Email */}
          {showEmail && (
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: "175ms" }}>
              <Label className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-accent" />
                Email {emailRequired ? "*" : ""}
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-10"
              />
            </div>
          )}

          {/* Occupation */}
          {showOccupation && (
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: "185ms" }}>
              <Label className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-accent" />
                Occupation {occupationRequired ? "*" : ""}
              </Label>
              <Input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="h-10"
              />
            </div>
          )}

          {/* Photo ID Type */}
          {showPhotoId && (
          <div className="space-y-2 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <Label className="flex items-center gap-2">
              <IdCard className="w-4 h-4 text-accent" />
              Photo ID Type {photoIdRequired ? "*" : ""}
            </Label>
            <Select
              value={photoIdType}
              onValueChange={(v) => {
                setPhotoIdType(v);
                setPhotoIdNumber("");
                setErrors((prev) => ({ ...prev, photoIdType: undefined, photoIdNumber: undefined }));
              }}
            >
              <SelectTrigger className="transition-all duration-200">
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
          )}

          {/* Photo ID Number */}
          {showPhotoId && photoIdType && (
            <div className="space-y-2 animate-fade-in">
              <Label>
                {photoIdType === "aadhaar" && `Aadhaar Number ${photoIdRequired ? "*" : ""}`}
                {photoIdType === "pan" && `PAN Number ${photoIdRequired ? "*" : ""}`}
                {photoIdType === "voter" && `Voter ID Number ${photoIdRequired ? "*" : ""}`}
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
          {showAddress && (
            <div className="space-y-2 animate-fade-in" style={{ animationDelay: "250ms" }}>
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-accent" />
                Address {addressRequired ? "*" : ""}
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
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button
              type="submit"
              variant="accent"
              className="flex-1 transition-all duration-200"
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
