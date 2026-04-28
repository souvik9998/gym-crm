import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import {
  fetchBiometricDevices, addBiometricDevice, updateBiometricDevice, deleteBiometricDevice,
  type BiometricDevice,
} from "@/api/biometric";
import {
  PlusIcon, ArrowPathIcon, TrashIcon, EyeIcon, EyeSlashIcon,
  SignalIcon, SignalSlashIcon, ServerIcon, WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

interface BiometricDevicesSectionProps {
  branches: Branch[];
  tenantId: string;
}

export function BiometricDevicesSection({ branches, tenantId }: BiometricDevicesSectionProps) {
  const queryClient = useQueryClient();
  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || "");
  const [showAdd, setShowAdd] = useState(false);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BiometricDevice | null>(null);
  const [form, setForm] = useState({ device_name: "", device_brand: "ZKTeco", device_serial: "", device_ip: "", device_port: "4370" });

  const { data: devices = [], isLoading, refetch } = useQuery({
    queryKey: ["biometric-devices", selectedBranchId],
    queryFn: () => fetchBiometricDevices(selectedBranchId),
    enabled: !!selectedBranchId,
  });

  const addMutation = useMutation({
    mutationFn: addBiometricDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setShowAdd(false);
      setForm({ device_name: "", device_brand: "ZKTeco", device_serial: "", device_ip: "", device_port: "4370" });
      toast({ title: "Device added", description: "Biometric device registered for this branch." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleSync = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateBiometricDevice(id, { is_sync_enabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["biometric-devices"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBiometricDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      toast({ title: "Device removed" });
    },
  });

  const handleAdd = () => {
    if (!selectedBranchId || !form.device_name || !form.device_serial) return;
    addMutation.mutate({
      branch_id: selectedBranchId,
      device_name: form.device_name,
      device_brand: form.device_brand,
      device_serial: form.device_serial,
      device_ip: form.device_ip || undefined,
      device_port: parseInt(form.device_port) || 4370,
    });
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  };

  const activeBranches = branches.filter(b => b.is_active);

  if (activeBranches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No active branches available. Create a branch first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Branch Selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm font-medium">Branch:</Label>
        <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            {activeBranches.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Devices Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <WrenchScrewdriverIcon className="w-5 h-5 text-primary" /> Biometric Devices
            </CardTitle>
            <CardDescription>Manage ZKTeco devices for the selected branch.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <ArrowPathIcon className="w-4 h-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
              <PlusIcon className="w-4 h-4" /> Add Device
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ServerIcon className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">No biometric devices configured for this branch.</p>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>Add your first device</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Serial / ID</TableHead>
                    <TableHead>IP : Port</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Logs</TableHead>
                    <TableHead>Sync</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((d) => (
                    <TableRow key={d.id} className="group">
                      <TableCell className="font-medium">{d.device_name}</TableCell>
                      <TableCell><Badge variant="secondary">{d.device_brand}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{d.device_serial}</TableCell>
                      <TableCell className="text-sm">{d.device_ip ? `${d.device_ip}:${d.device_port}` : "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          {d.last_sync_at ? <SignalIcon className="w-3.5 h-3.5 text-primary" /> : <SignalSlashIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                          {formatTime(d.last_sync_at)}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{d.total_logs_received.toLocaleString()}</TableCell>
                      <TableCell>
                        <Switch checked={d.is_sync_enabled} onCheckedChange={(v) => toggleSync.mutate({ id: d.id, enabled: v })} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setShowApiKey(showApiKey === d.id ? null : d.id)}>
                          {showApiKey === d.id ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </Button>
                        {showApiKey === d.id && (
                          <div className="mt-1">
                            <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded break-all select-all">{d.api_key}</code>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(d)}>
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Device Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Biometric Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Device Name *</Label>
              <Input value={form.device_name} onChange={e => setForm(p => ({ ...p, device_name: e.target.value }))} placeholder="Main Entrance Scanner" />
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={form.device_brand} onValueChange={v => setForm(p => ({ ...p, device_brand: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZKTeco">ZKTeco</SelectItem>
                  <SelectItem value="Hikvision">Hikvision</SelectItem>
                  <SelectItem value="eSSL">eSSL</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Device Serial / ID *</Label>
              <Input value={form.device_serial} onChange={e => setForm(p => ({ ...p, device_serial: e.target.value }))} placeholder="ZK-12345" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input value={form.device_ip} onChange={e => setForm(p => ({ ...p, device_ip: e.target.value }))} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input type="number" value={form.device_port} onChange={e => setForm(p => ({ ...p, device_port: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending || !form.device_name || !form.device_serial}>
              {addMutation.isPending ? "Adding..." : "Add Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove Device"
        description={`Remove "${deleteTarget?.device_name}"? The device will be deactivated.`}
        confirmText="Remove"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        variant="destructive"
      />
    </div>
  );
}
