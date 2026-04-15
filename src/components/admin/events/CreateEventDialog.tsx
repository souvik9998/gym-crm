import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PricingOption {
  id?: string;
  name: string;
  price: number;
  capacity_limit: number | null;
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
  const isEditing = !!editEvent;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [whatsappNotify, setWhatsappNotify] = useState(false);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([
    { name: "General", price: 0, capacity_limit: null },
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
      if (editEvent.event_pricing_options?.length) {
        setPricingOptions(editEvent.event_pricing_options.map((p: any) => ({
          id: p.id, name: p.name, price: p.price, capacity_limit: p.capacity_limit,
        })));
      }
      // Load custom fields
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

  const resetForm = () => {
    setTitle(""); setDescription(""); setBannerUrl("");
    setEventDate(""); setEventEndDate(""); setLocation("");
    setStatus("draft"); setWhatsappNotify(false);
    setPricingOptions([{ name: "General", price: 0, capacity_limit: null }]);
    setCustomFields([]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentBranch?.id) throw new Error("No branch selected");
      if (!title.trim()) throw new Error("Title is required");
      if (!eventDate) throw new Error("Event date is required");
      if (pricingOptions.length === 0) throw new Error("At least one pricing option is required");

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
      };

      let eventId: string;

      if (isEditing) {
        const { error } = await supabase.from("events").update(eventData).eq("id", editEvent.id);
        if (error) throw error;
        eventId = editEvent.id;

        // Delete old pricing options and recreate
        await supabase.from("event_pricing_options").delete().eq("event_id", eventId);
        await supabase.from("event_custom_fields").delete().eq("event_id", eventId);
      } else {
        const { data, error } = await supabase.from("events").insert(eventData).select("id").single();
        if (error) throw error;
        eventId = data.id;
      }

      // Insert pricing options
      if (pricingOptions.length > 0) {
        const { error: pError } = await supabase.from("event_pricing_options").insert(
          pricingOptions.map((p, i) => ({
            event_id: eventId,
            name: p.name,
            price: p.price,
            capacity_limit: p.capacity_limit || null,
            sort_order: i,
          }))
        );
        if (pError) throw pError;
      }

      // Insert custom fields
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success(isEditing ? "Event updated" : "Event created");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error("Error", { description: err.message }),
  });

  const addPricing = () => setPricingOptions([...pricingOptions, { name: "", price: 0, capacity_limit: null }]);
  const removePricing = (i: number) => setPricingOptions(pricingOptions.filter((_, idx) => idx !== i));
  const updatePricing = (i: number, field: string, value: any) => {
    const updated = [...pricingOptions];
    (updated[i] as any)[field] = value;
    setPricingOptions(updated);
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
                <Label>Banner Image URL</Label>
                <Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://..." className="rounded-xl" />
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

            {/* Pricing Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Pricing Options</h3>
                <Button size="sm" variant="outline" onClick={addPricing} className="h-7 text-xs rounded-lg gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {pricingOptions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-border/40 bg-muted/20">
                  <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Input
                    value={p.name}
                    onChange={(e) => updatePricing(i, "name", e.target.value)}
                    placeholder="Option name"
                    className="rounded-lg h-9 text-sm"
                  />
                  <div className="relative w-28 flex-shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      value={p.price}
                      onChange={(e) => updatePricing(i, "price", Number(e.target.value))}
                      className="rounded-lg h-9 text-sm pl-7"
                      min={0}
                    />
                  </div>
                  <Input
                    type="number"
                    value={p.capacity_limit ?? ""}
                    onChange={(e) => updatePricing(i, "capacity_limit", e.target.value ? Number(e.target.value) : null)}
                    placeholder="Capacity"
                    className="rounded-lg h-9 text-sm w-24 flex-shrink-0"
                    min={0}
                  />
                  {pricingOptions.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 text-destructive" onClick={() => removePricing(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
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
              {customFields.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No custom fields added</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border/40">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-xl">
              {saveMutation.isPending ? <><ButtonSpinner /> Saving...</> : isEditing ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
