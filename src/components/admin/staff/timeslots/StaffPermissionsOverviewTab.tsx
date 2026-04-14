import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Staff } from "@/pages/admin/StaffManagement";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffPermissionsOverviewTabProps {
  allStaff: Staff[];
}

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  trainer: "Trainer",
  reception: "Reception",
  accountant: "Accountant",
};

export const StaffPermissionsOverviewTab = ({ allStaff }: StaffPermissionsOverviewTabProps) => {
  const isCompact = useIsTabletOrBelow();
  const [saving, setSaving] = useState<string | null>(null);

  const handleTogglePermission = async (staffMember: Staff, permKey: string, value: boolean) => {
    if (!staffMember.permissions) return;
    setSaving(staffMember.id);
    try {
      const { error } = await supabase
        .from("staff_permissions")
        .update({ [permKey]: value })
        .eq("staff_id", staffMember.id);
      if (error) throw error;
      // Optimistic — parent refetches
      toast.success(`Updated ${staffMember.full_name}'s permissions`);
    } catch {
      toast.error("Failed to update permission");
    } finally {
      setSaving(null);
    }
  };

  const handleMemberAccessChange = async (staffMember: Staff, value: string) => {
    if (!staffMember.permissions) return;
    setSaving(staffMember.id);
    try {
      const { error } = await supabase
        .from("staff_permissions")
        .update({ member_access_type: value })
        .eq("staff_id", staffMember.id);
      if (error) throw error;
      toast.success(`Updated ${staffMember.full_name}'s member access`);
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "manager": return "bg-blue-100 text-blue-800";
      case "trainer": return "bg-purple-100 text-purple-800";
      case "accountant": return "bg-green-100 text-green-800";
      case "reception": return "bg-yellow-100 text-yellow-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (isCompact) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Staff Permissions Overview</h3>
          <p className="text-xs text-muted-foreground">Quick view and edit of all staff permissions</p>
        </div>
        <div className="space-y-2">
          {allStaff.map(s => {
            const perms = s.permissions;
            return (
              <Card key={s.id} className="border-0 shadow-sm">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{s.full_name}</p>
                      <Badge className={`${getRoleBadgeColor(s.role)} text-[10px] px-1.5 py-0`}>
                        {ROLE_LABELS[s.role] || s.role}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {(perms as any)?.member_access_type === "assigned" ? "Assigned Only" : "All Members"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="flex items-center justify-between p-1.5 bg-muted/30 rounded">
                      <span>Manage Slots</span>
                      <Switch
                        checked={!!(perms as any)?.can_manage_time_slots}
                        onCheckedChange={v => handleTogglePermission(s, "can_manage_time_slots", v)}
                        disabled={saving === s.id}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-muted/30 rounded">
                      <span>View Slots</span>
                      <Switch
                        checked={!!(perms as any)?.can_view_time_slots}
                        onCheckedChange={v => handleTogglePermission(s, "can_view_time_slots", v)}
                        disabled={saving === s.id}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-muted/30 rounded">
                      <span>Assign Members</span>
                      <Switch
                        checked={!!(perms as any)?.can_assign_members_to_slots}
                        onCheckedChange={v => handleTogglePermission(s, "can_assign_members_to_slots", v)}
                        disabled={saving === s.id}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-muted/30 rounded">
                      <span>View Members</span>
                      <Switch
                        checked={!!(perms as any)?.can_view_slot_members}
                        onCheckedChange={v => handleTogglePermission(s, "can_view_slot_members", v)}
                        disabled={saving === s.id}
                        className="scale-75"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Staff Permissions Overview</h3>
        <p className="text-sm text-muted-foreground">Quick view and inline editing of time slot and member access permissions</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Member Access</TableHead>
                  <TableHead className="text-center">Manage Slots</TableHead>
                  <TableHead className="text-center">Create</TableHead>
                  <TableHead className="text-center">Edit/Delete</TableHead>
                  <TableHead className="text-center">View Slots</TableHead>
                  <TableHead className="text-center">Assign</TableHead>
                  <TableHead className="text-center">View Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allStaff.map(s => {
                  const perms = s.permissions;
                  const isSaving = saving === s.id;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell>
                        <Badge className={`${getRoleBadgeColor(s.role)} text-xs`}>{ROLE_LABELS[s.role] || s.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={(perms as any)?.member_access_type || "all"}
                          onValueChange={v => handleMemberAccessChange(s, v)}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="assigned">Assigned</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_manage_time_slots} onCheckedChange={v => handleTogglePermission(s, "can_manage_time_slots", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_create_time_slots} onCheckedChange={v => handleTogglePermission(s, "can_create_time_slots", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_edit_delete_time_slots} onCheckedChange={v => handleTogglePermission(s, "can_edit_delete_time_slots", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_view_time_slots} onCheckedChange={v => handleTogglePermission(s, "can_view_time_slots", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_assign_members_to_slots} onCheckedChange={v => handleTogglePermission(s, "can_assign_members_to_slots", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!(perms as any)?.can_view_slot_members} onCheckedChange={v => handleTogglePermission(s, "can_view_slot_members", v)} disabled={isSaving} className="mx-auto" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
