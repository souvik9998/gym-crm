import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/contexts/BranchContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  ShareIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useWhatsAppOverlay } from "@/hooks/useWhatsAppOverlay";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { logStaffActivity } from "@/hooks/useStaffActivityLog";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

interface ShareCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
}

interface MemberRow {
  id: string;
  name: string;
  phone: string;
  status?: string;
}

type Audience = "all_active" | "all" | "specific";

const ShareCalendarDialog = ({ open, onOpenChange, shareUrl }: ShareCalendarDialogProps) => {
  const { currentBranch } = useBranch();
  const { isStaffLoggedIn, staffUser } = useStaffAuth();
  const whatsAppOverlay = useWhatsAppOverlay();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState<Audience>("all_active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCopied(false);
      setSearch("");
      setAudience("all_active");
      setSelectedIds(new Set());
      const gymName = currentBranch?.name || "our gym";
      setMessage(
        `📅 *${gymName} – Gym Calendar*\n\nHi! Here's our latest schedule with upcoming events, holidays and gym closures.\n\n👉 ${shareUrl}\n\nSave the link to stay updated. See you at the gym! 💪`
      );
    }
  }, [open, currentBranch, shareUrl]);

  // Fetch members when dialog opens
  useEffect(() => {
    const fetchMembers = async () => {
      if (!open || !currentBranch?.id) return;
      setLoadingMembers(true);
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone, subscriptions(status)")
        .eq("branch_id", currentBranch.id)
        .order("name", { ascending: true });

      if (!error && data) {
        const rows: MemberRow[] = data.map((m: any) => {
          const subs = m.subscriptions || [];
          const isActive = subs.some(
            (s: any) => s.status === "active" || s.status === "expiring_soon"
          );
          return {
            id: m.id,
            name: m.name,
            phone: m.phone,
            status: isActive ? "active" : "inactive",
          };
        });
        setMembers(rows);
      }
      setLoadingMembers(false);
    };
    fetchMembers();
  }, [open, currentBranch]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q)
    );
  }, [members, search]);

  const targetMemberIds = useMemo(() => {
    if (audience === "all") return members.map((m) => m.id);
    if (audience === "all_active")
      return members.filter((m) => m.status === "active").map((m) => m.id);
    return Array.from(selectedIds);
  }, [audience, members, selectedIds]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredMembers.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Calendar link copied!");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.info(shareUrl);
    }
  };

  const handleSend = async () => {
    if (!currentBranch?.id) return;
    if (!message.trim()) {
      toast.error("Please add a message");
      return;
    }
    if (targetMemberIds.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }

    setIsSending(true);
    const recipientLabel =
      audience === "specific"
        ? `${targetMemberIds.length} selected member${targetMemberIds.length === 1 ? "" : "s"}`
        : audience === "all"
          ? "all members"
          : "all active members";

    const started = whatsAppOverlay.startSending(recipientLabel);
    if (!started) {
      setIsSending(false);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          memberIds: targetMemberIds,
          type: "custom",
          customMessage: message,
          isManual: true,
          adminUserId: sessionData?.session?.user?.id || null,
          branchId: currentBranch.id,
          branchName: currentBranch.name,
        },
      });

      if (error) {
        whatsAppOverlay.markError("Failed to send calendar");
        console.error("Share calendar error:", error);
      } else {
        const successCount = data?.results?.filter((r: any) => r.success).length || 0;
        const failCount = data?.results?.filter((r: any) => !r.success).length || 0;
        whatsAppOverlay.markSuccess();
        if (failCount > 0) {
          toast.info(`Sent to ${successCount}, ${failCount} failed`);
        } else {
          toast.success(`Calendar shared with ${successCount} ${successCount === 1 ? "member" : "members"}`);
        }
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("Share calendar error:", err);
      whatsAppOverlay.markError(err?.message || "Failed to share calendar");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <DialogHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              <ShareIcon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base lg:text-lg">Share Calendar</DialogTitle>
              <DialogDescription className="text-xs lg:text-sm">
                Send the gym calendar to members via WhatsApp or copy the link
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Public link */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Public Link</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono bg-muted/30"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className="gap-1.5 rounded-lg flex-shrink-0"
                disabled={!shareUrl}
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="w-4 h-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Send To</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "all_active", label: "All Active", desc: "Active members" },
                { key: "all", label: "All Members", desc: "Everyone" },
                { key: "specific", label: "Specific", desc: "Pick members" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAudience(opt.key)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all duration-200",
                    audience === opt.key
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/40 hover:border-border hover:bg-muted/30"
                  )}
                >
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-[10px] lg:text-[11px] text-muted-foreground mt-0.5">
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Member picker */}
          {audience === "specific" && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Select Members</Label>
                <div className="flex items-center gap-2 text-[11px]">
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear ({selectedIds.size})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="text-primary hover:underline"
                  >
                    Select all visible
                  </button>
                </div>
              </div>

              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <div className="border border-border/40 rounded-xl overflow-hidden">
                <ScrollArea className="h-[220px]">
                  {loadingMembers ? (
                    <div className="p-3 space-y-2">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                      <UsersIcon className="w-8 h-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {search ? "No members match your search" : "No members found"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {filteredMembers.map((m) => {
                        const isSelected = selectedIds.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleToggle(m.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                              isSelected ? "bg-primary/5" : "hover:bg-muted/40"
                            )}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              <p className="text-[11px] text-muted-foreground">{m.phone}</p>
                            </div>
                            {m.status === "active" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-600">
                                Active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="text-sm resize-none font-mono"
              placeholder="Write a short note for your members…"
            />
            <p className="text-[10px] text-muted-foreground">
              The link will be included in the message. Use *bold* and emoji freely.
            </p>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border/40 bg-muted/20 gap-2 sm:gap-2">
          <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
            <UsersIcon className="w-3.5 h-3.5" />
            <span>
              {targetMemberIds.length} recipient{targetMemberIds.length === 1 ? "" : "s"}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || targetMemberIds.length === 0 || !message.trim()}
            className="gap-1.5 rounded-lg"
          >
            {isSending ? (
              <>
                <ButtonSpinner />
                Sending…
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="w-4 h-4" />
                Send via WhatsApp
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareCalendarDialog;
