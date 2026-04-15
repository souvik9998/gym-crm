import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, Trash2, GripVertical, Upload, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ButtonSpinner as Spinner } from "@/components/ui/button-spinner";
import { Badge } from "@/components/ui/badge";

interface PricingOption {
  id?: string;
  name: string;
  description: string;
  price: number;
  capacity_limit: number | null;
  is_active: boolean;
}

interface CustomField {
  id?: string;
  field_name: string;
  field_type: "text" | "number" | "select";
  is_required: boolean;
  options: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEvent?: any;
}

export function CreateEventDialog({ open, onOpenChange, editEvent }: Props) {
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const { isAdmin } = useIsAdmin();
  const isEditing = !!editEvent;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [whatsappNotify, setWhatsappNotify] = useState(false);
  const [pricingType, setPricingType] = useState<"single" | "variable">("single");
  const [singlePrice, setSinglePrice] = useState<number>(0);
  const [singleCapacity, setSingleCapacity] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState<string>("single");
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([
    { name: "General", description: "", price: 0, capacity_limit: null, is_active: true },
  ]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title || "");
      setDescription(editEvent.description || "");
      setBannerUrl(editEvent.banner_image_url || "");
      setEventDate(editEvent.event_date ? new Date(editEvent.event_date).toISOString().slice(0, 16) : "");
      setEventEndDate(editEvent.event_end_date ? new Date(editEvent.event_end_date).toISOString().slice(0, 16) : "");
      setLocation(editEvent.location || "");
      setStatus(editEvent.status || "draft");
      setWhatsappNotify(editEvent.whatsapp_notify_on_register || false);
      setSelectionMode(editEvent.selection_mode || "single");
      if (editEvent.event_pricing_options?.length) {
        const opts = editEvent.event_pricing_options.map((p: any) => ({
          id: p.id, name: p.name, description: p.description || "", price: p.price,
          capacity_limit: p.capacity_limit, is_active: p.is_active ?? true,
        }));
        setPricingOptions(opts);
        // Detect pricing type: if all items have the same price, treat as uniform
        const allSamePrice = opts.every((o: any) => o.price === opts[0].price);
        if (allSamePrice) {
          setPricingType("single");
          setSinglePrice(opts[0].price);
        } else {
          setPricingType("variable");
        }
      } else {
        setPricingType("single");
        setSinglePrice(0);
        setSingleCapacity(null);
      }
      loadCustomFields(editEvent.id);
    } else {
      resetForm();
    }
  }, [editEvent, open]);

  const loadCustomFields = async (eventId: string) => {
    const { data } = await supabase
      .from("event_custom_fields")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order");
    if (data) {
      setCustomFields(data.map((f: any) => ({
        id: f.id,
        field_name: f.field_name,
        field_type: f.field_type,
        is_required: f.is_required,
        options: Array.isArray(f.options) ? f.options : [],
      })));
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `event-banners/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("event-assets").upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("event-assets").getPublicUrl(path);
      setBannerUrl(urlData.publicUrl);
      toast.success("Banner uploaded");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setTitle(""); setDescription(""); setBannerUrl("");
    setEventDate(""); setEventEndDate(""); setLocation("");
    setStatus("draft"); setWhatsappNotify(false); setUploading(false);
    setPricingType("single"); setSinglePrice(0); setSingleCapacity(null);
    setSelectionMode("single");
    setPricingOptions([{ name: "General", description: "", price: 0, capacity_limit: null, is_active: true }]);
    setCustomFields([]);
  };

  // Resolve final pricing options based on pricing type
  // Single Price: all items share the same singlePrice; Variable: each item has its own price
  const getEffectivePricingOptions = (): PricingOption[] => {
    if (pricingType === "single") {
      return pricingOptions.map(p => ({ ...p, price: singlePrice }));
    }
    return pricingOptions;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranch?.id) throw new Error("No branch selected");
      if (!title.trim()) throw new Error("Title is required");
      if (!eventDate) throw new Error("Event date is required");
      const effectiveOptions = getEffectivePricingOptions();
      if (effectiveOptions.length === 0) throw new Error("At least one item is required");

      const effectiveSelectionMode = pricingOptions.length <= 1 ? "single" : selectionMode;

      const eventData = {
        branch_id: currentBranch.id,
        title: title.trim(),
        description: description.trim() || null,
        banner_image_url: bannerUrl.trim() || null,
        event_date: new Date(eventDate).toISOString(),
        event_end_date: eventEndDate ? new Date(eventEndDate).toISOString() : null,
        location: location.trim() || null,
        status,
        whatsapp_notify_on_register: whatsappNotify,
        selection_mode: effectiveSelectionMode,
      };

      let eventId: string;

      if (isEditing) {
        const { error } = await supabase.from("events").update(eventData).eq("id", editEvent.id);
        if (error) throw error;
        eventId = editEvent.id;

        // Smart upsert: update existing, insert new, delete removed
        const existingIds = effectiveOptions.filter(p => p.id).map(p => p.id!);
        
        // Get all current pricing option IDs for this event
        const { data: currentOptions } = await supabase
          .from("event_pricing_options")
          .select("id")
          .eq("event_id", eventId);
        
        const currentIds = (currentOptions || []).map(o => o.id);
        const idsToRemove = currentIds.filter(id => !existingIds.includes(id));
        
        // Delete removed pricing options (only those not referenced by registrations)
        for (const removeId of idsToRemove) {
          const { count } = await supabase
            .from("event_registration_items")
            .select("id", { count: "exact", head: true })
            .eq("pricing_option_id", removeId);
          const { count: regCount } = await supabase
            .from("event_registrations")
            .select("id", { count: "exact", head: true })
            .eq("pricing_option_id", removeId);
          if ((count || 0) === 0 && (regCount || 0) === 0) {
            await supabase.from("event_pricing_options").delete().eq("id", removeId);
          }
        }

        // Update existing and insert new pricing options
        for (let i = 0; i < effectiveOptions.length; i++) {
          const p = effectiveOptions[i];
          if (p.id) {
            await supabase.from("event_pricing_options").update({
              name: p.name,
              description: p.description || null,
              price: p.price,
              capacity_limit: p.capacity_limit || null,
              is_active: p.is_active,
              sort_order: i,
            }).eq("id", p.id);
          } else {
            await supabase.from("event_pricing_options").insert({
              event_id: eventId,
              name: p.name,
              description: p.description || null,
              price: p.price,
              capacity_limit: p.capacity_limit || null,
              is_active: p.is_active,
              sort_order: i,
            });
          }
        }

        // Handle custom fields: delete and re-insert (no FK dependencies)
        await supabase.from("event_custom_fields").delete().eq("event_id", eventId);
      } else {
        const { data, error } = await supabase.from("events").insert(eventData).select("id").single();
        if (error) throw error;
        eventId = data.id;

        // Insert pricing options for new events
        if (effectiveOptions.length > 0) {
          const { error: pError } = await supabase.from("event_pricing_options").insert(
            effectiveOptions.map((p, i) => ({
              event_id: eventId,
              name: p.name,
              description: p.description || null,
              price: p.price,
              capacity_limit: p.capacity_limit || null,
              is_active: p.is_active,
              sort_order: i,
            }))
          );
          if (pError) throw pError;
        }
      }

      if (customFields.length > 0) {
        const { error: fError } = await supabase.from("event_custom_fields").insert(
          customFields.map((f, i) => ({
            event_id: eventId,
            field_name: f.field_name,
            field_type: f.field_type,
            is_required: f.is_required,
            options: f.field_type === "select" ? f.options : null,
            sort_order: i,
          }))
        );
        if (fError) throw fError;
      }

      return eventId;
    },
    onSuccess: (eventId) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["event-detail", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-registrations", eventId] });
      toast.success(isEditing ? "Event updated" : "Event created");

      // Activity logging
      const activityType = isEditing ? "event_updated" : "event_created";
      const desc = isEditing
        ? `${isStaffLoggedIn ? `Staff "${staffUser?.fullName}"` : "Admin"} updated event "${title}"`
        : `${isStaffLoggedIn ? `Staff "${staffUser?.fullName}"` : "Admin"} created event "${title}"`;

      if (isStaffLoggedIn && staffUser) {
        logStaffActivity({
          category: "events",
          type: activityType,
          description: desc,
          entityType: "events",
          entityName: title,
          newValue: { title, status, selection_mode: selectionMode, pricing_options: pricingOptions.length },
          branchId: currentBranch?.id,
          staffId: staffUser.id,
          staffName: staffUser.fullName,
          staffPhone: staffUser.phone,
        });
      } else if (isAdmin) {
        logAdminActivity({
          category: "events",
          type: activityType,
          description: desc,
          entityType: "events",
          entityName: title,
          newValue: { title, status, selection_mode: selectionMode, pricing_options: pricingOptions.length },
          branchId: currentBranch?.id,
        });
      }

      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error("Error", { description: err.message }),
  });

  const addPricing = () => setPricingOptions(prev => [...prev, { name: "", description: "", price: 0, capacity_limit: null, is_active: true }]);
  const removePricing = (i: number) => {
    setPricingOptions(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== i);
    });
  };
  const updatePricing = (i: number, field: string, value: any) => {
    setPricingOptions(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  const addCustomField = () => setCustomFields([...customFields, { field_name: "", field_type: "text", is_required: false, options: [] }]);
  const removeCustomField = (i: number) => setCustomFields(customFields.filter((_, idx) => idx !== i));
  const updateCustomField = (i: number, field: string, value: any) => {
    const updated = [...customFields];
    (updated[i] as any)[field] = value;
    setCustomFields(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isEditing ? "Edit Event" : "Create Event"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-120px)] px-6 pb-6">
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Event Details</h3>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Event description..." className="rounded-xl min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label>Banner Image</Label>
                {bannerUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border/40">
                    <img src={bannerUrl} alt="Banner" className="w-full h-36 object-cover" />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-2 right-2 h-7 w-7 rounded-full"
                      onClick={() => setBannerUrl("")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border/60 bg-muted/20 cursor-pointer hover:border-primary/40 transition-colors">
                    {uploading ? (
                      <><Spinner /><span className="text-xs text-muted-foreground">Uploading...</span></>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Click to upload banner image</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploading} />
                  </label>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">or</span>
                  <Input
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    placeholder="Paste image URL..."
                    className="rounded-xl text-xs h-8"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date & Time *</Label>
                  <Input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>End Date & Time</Label>
                  <Input type="datetime-local" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} className="rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue / Address" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={whatsappNotify} onCheckedChange={setWhatsappNotify} />
                <Label>Send WhatsApp notification on registration</Label>
              </div>
            </div>

            {/* Event Items & Pricing */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Event Items</h3>
                <Button size="sm" variant="outline" onClick={addPricing} className="h-7 text-xs rounded-lg gap-1">
                  <Plus className="w-3 h-3" /> Add Item
                </Button>
              </div>

              {/* Pricing Type Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20">
                <Label className="text-xs text-muted-foreground flex-shrink-0">Pricing:</Label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPricingType("single")}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      pricingType === "single"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    Uniform Price
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingType("variable")}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      pricingType === "variable"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    Variable Price
                  </button>
                </div>
              </div>

              {/* Uniform price input */}
              {pricingType === "single" && (
                <div className="p-3 rounded-xl border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground flex-shrink-0">Price for all items:</Label>
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={singlePrice === 0 ? "" : String(singlePrice)}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setSinglePrice(val === "" ? 0 : Number(val));
                        }}
                        placeholder="0 = Free"
                        className="rounded-lg h-9 text-sm pl-7"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Selection Mode */}
              {pricingOptions.length > 1 && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-muted/20">
                  <Label className="text-xs text-muted-foreground flex-shrink-0">Selection Mode:</Label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectionMode("single")}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        selectionMode === "single"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      Single Select
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionMode("multiple")}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        selectionMode === "multiple"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      Multiple Select
                    </button>
                  </div>
                </div>
              )}

              {/* Item list */}
              {pricingOptions.map((p, i) => (
                <div key={p.id || `new-${i}`} className="p-3 rounded-xl border border-border/40 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      value={p.name}
                      onChange={(e) => updatePricing(i, "name", e.target.value)}
                      placeholder="Item name (e.g. Day 1, Full Pass)"
                      className="rounded-lg h-9 text-sm"
                    />
                    {pricingType === "variable" && (
                      <div className="relative w-28 flex-shrink-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={p.price === 0 ? "" : String(p.price)}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            updatePricing(i, "price", val === "" ? 0 : Number(val));
                          }}
                          placeholder="0"
                          className="rounded-lg h-9 text-sm pl-7"
                        />
                      </div>
                    )}
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={p.capacity_limit ? String(p.capacity_limit) : ""}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        updatePricing(i, "capacity_limit", val === "" ? null : Number(val));
                      }}
                      placeholder="Capacity"
                      className="rounded-lg h-9 text-sm w-24 flex-shrink-0"
                    />
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Switch
                        checked={p.is_active}
                        onCheckedChange={(v) => updatePricing(i, "is_active", v)}
                        className="scale-75"
                      />
                      {!p.is_active && <Badge variant="secondary" className="text-[9px] py-0">Off</Badge>}
                    </div>
                    {pricingOptions.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 text-destructive" onClick={() => removePricing(i)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={p.description}
                    onChange={(e) => updatePricing(i, "description", e.target.value)}
                    placeholder="Description (optional)"
                    className="rounded-lg h-8 text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Custom Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Custom Registration Fields</h3>
                <Button size="sm" variant="outline" onClick={addCustomField} className="h-7 text-xs rounded-lg gap-1">
                  <Plus className="w-3 h-3" /> Add Field
                </Button>
              </div>
              {customFields.map((f, i) => (
                <div key={i} className="p-3 rounded-xl border border-border/40 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={f.field_name}
                      onChange={(e) => updateCustomField(i, "field_name", e.target.value)}
                      placeholder="Field name"
                      className="rounded-lg h-9 text-sm"
                    />
                    <Select value={f.field_type} onValueChange={(v) => updateCustomField(i, "field_type", v)}>
                      <SelectTrigger className="rounded-lg h-9 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Switch checked={f.is_required} onCheckedChange={(v) => updateCustomField(i, "is_required", v)} className="scale-75" />
                      <span className="text-[10px] text-muted-foreground">Req</span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 text-destructive" onClick={() => removeCustomField(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {f.field_type === "select" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Options (comma separated)</Label>
                      <Input
                        value={f.options.join(", ")}
                        onChange={(e) => updateCustomField(i, "options", e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
                        placeholder="Option A, Option B, Option C"
                        className="rounded-lg h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-11 rounded-xl"
            >
              {saveMutation.isPending ? <ButtonSpinner /> : (isEditing ? "Update Event" : "Create Event")}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}