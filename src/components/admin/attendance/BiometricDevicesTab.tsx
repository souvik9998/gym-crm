import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { useBranch } from "@/contexts/BranchContext";
import {
  fetchBiometricDevices, addBiometricDevice, updateBiometricDevice, deleteBiometricDevice,
  fetchBiometricMappings, mapBiometricUser, unmapBiometricUser,
  fetchBiometricSyncLogs,
  type BiometricDevice, type BiometricMemberMapping, type BiometricSyncLog,
} from "@/api/biometric";
import {
  PlusIcon, ArrowPathIcon, TrashIcon, EyeIcon, EyeSlashIcon,
  LinkIcon, SignalIcon, SignalSlashIcon, ServerIcon, UserGroupIcon, ClockIcon,
  WrenchScrewdriverIcon, DocumentTextIcon,
} from "@heroicons/react/24/outline";

export const BiometricDevicesTab = () => {
  const { currentBranch } = useBranch();
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("devices");

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-muted/50 rounded-xl p-1">
          <TabsTrigger value="devices" className="gap-2 rounded-lg">
            <ServerIcon className="w-4 h-4" /> Devices
          </TabsTrigger>
          <TabsTrigger value="mappings" className="gap-2 rounded-lg">
            <UserGroupIcon className="w-4 h-4" /> Member Mapping
          </TabsTrigger>
          <TabsTrigger value="sync-logs" className="gap-2 rounded-lg">
            <DocumentTextIcon className="w-4 h-4" /> Sync Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <DevicesSection branchId={currentBranch?.id} />
        </TabsContent>
        <TabsContent value="mappings">
          <MappingsSection branchId={currentBranch?.id} />
        </TabsContent>
        <TabsContent value="sync-logs">
          <SyncLogsSection branchId={currentBranch?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Devices Section ───
function DevicesSection({ branchId }: { branchId?: string }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showApiKey, setShowApiKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BiometricDevice | null>(null);
  const [form, setForm] = useState({ device_name: "", device_brand: "ZKTeco", device_serial: "", device_ip: "", device_port: "4370" });

  const { data: devices = [], isLoading, refetch } = useQuery({
    queryKey: ["biometric-devices", branchId],
    queryFn: () => fetchBiometricDevices(branchId),
    enabled: !!branchId,
  });

  const addMutation = useMutation({
    mutationFn: addBiometricDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setShowAdd(false);
      setForm({ device_name: "", device_brand: "ZKTeco", device_serial: "", device_ip: "", device_port: "4370" });
      toast({ title: "Device added", description: "Biometric device has been registered." });
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
    if (!branchId || !form.device_name || !form.device_serial) return;
    addMutation.mutate({
      branch_id: branchId,
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

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-primary" /> Biometric Devices
          </CardTitle>
          <CardDescription>Manage ZKTeco and other biometric devices connected to your branch.</CardDescription>
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
            <p className="text-muted-foreground">No biometric devices configured.</p>
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
                        {d.last_sync_at ? <SignalIcon className="w-3.5 h-3.5 text-green-500" /> : <SignalSlashIcon className="w-3.5 h-3.5 text-muted-foreground" />}
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

      {/* Add Device Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Biometric Device</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Device Name *</Label>
              <Input placeholder="e.g. Front Entrance ZKTeco" value={form.device_name} onChange={(e) => setForm({ ...form, device_name: e.target.value })} />
            </div>
            <div>
              <Label>Device Brand</Label>
              <Select value={form.device_brand} onValueChange={(v) => setForm({ ...form, device_brand: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZKTeco">ZKTeco</SelectItem>
                  <SelectItem value="Hikvision">Hikvision</SelectItem>
                  <SelectItem value="eSSL">eSSL</SelectItem>
                  <SelectItem value="Realtime">Realtime</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Device Serial / ID *</Label>
              <Input placeholder="e.g. ZK-001 or serial number" value={form.device_serial} onChange={(e) => setForm({ ...form, device_serial: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Device IP Address</Label>
                <Input placeholder="192.168.1.100" value={form.device_ip} onChange={(e) => setForm({ ...form, device_ip: e.target.value })} />
              </div>
              <div>
                <Label>Port</Label>
                <Input type="number" placeholder="4370" value={form.device_port} onChange={(e) => setForm({ ...form, device_port: e.target.value })} />
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove Device"
        description={`Remove "${deleteTarget?.device_name}"? Sync will stop and logs will be preserved.`}
        confirmText="Remove"
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Card>
  );
}

// ─── Mappings Section ───
function MappingsSection({ branchId }: { branchId?: string }) {
  const queryClient = useQueryClient();
  const [memberSearch, setMemberSearch] = useState("");
  const [mapTarget, setMapTarget] = useState<BiometricMemberMapping | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ["biometric-mappings", branchId],
    queryFn: () => fetchBiometricMappings(branchId),
    enabled: !!branchId,
  });

  // Fetch members for mapping dropdown
  const { data: membersData } = useQuery({
    queryKey: ["members-for-mapping", branchId],
    queryFn: async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("members")
        .select("id, name, phone")
        .eq("branch_id", branchId!)
        .order("name");
      return data || [];
    },
    enabled: !!branchId && !!mapTarget,
  });

  const mapMutation = useMutation({
    mutationFn: ({ mappingId, memberId }: { mappingId: string; memberId: string }) => mapBiometricUser(mappingId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings"] });
      setMapTarget(null);
      setSelectedMemberId("");
      toast({ title: "Mapped", description: "Biometric user linked to member." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const unmapMutation = useMutation({
    mutationFn: unmapBiometricUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-mappings"] });
      toast({ title: "Unmapped" });
    },
  });

  const unmappedCount = mappings.filter((m) => !m.is_mapped).length;
  const filteredMembers = (membersData || []).filter((m: any) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) || m.phone.includes(memberSearch)
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary" /> Member Mapping
          {unmappedCount > 0 && (
            <Badge variant="destructive" className="ml-2">{unmappedCount} Unmapped</Badge>
          )}
        </CardTitle>
        <CardDescription>Link biometric user IDs from devices to gym members for automatic attendance tracking.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading mappings...</div>
        ) : mappings.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">No biometric users detected yet. Mappings will appear after the first device sync.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Biometric ID</TableHead>
                  <TableHead>Biometric Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mapped Member</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => (
                  <TableRow key={m.id} className={!m.is_mapped ? "bg-orange-500/5" : ""}>
                    <TableCell className="font-mono text-sm">{m.biometric_user_id}</TableCell>
                    <TableCell>{m.biometric_user_name || "—"}</TableCell>
                    <TableCell>
                      {m.is_mapped ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">Mapped</Badge>
                      ) : (
                        <Badge className="bg-orange-500/10 text-orange-600 border-orange-200">Unmapped</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.is_mapped && m.members ? (
                        <span>{m.members.name} ({m.members.phone})</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button variant="outline" size="sm" onClick={() => { setMapTarget(m); setSelectedMemberId(m.member_id || ""); }}>
                        {m.is_mapped ? "Re-map" : "Map"}
                      </Button>
                      {m.is_mapped && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => unmapMutation.mutate(m.id)}>
                          Unmap
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Map Dialog */}
      <Dialog open={!!mapTarget} onOpenChange={(open) => !open && setMapTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Map Biometric User → Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="text-sm"><span className="text-muted-foreground">Biometric ID:</span> <strong>{mapTarget?.biometric_user_id}</strong></p>
              {mapTarget?.biometric_user_name && (
                <p className="text-sm"><span className="text-muted-foreground">Name on device:</span> {mapTarget.biometric_user_name}</p>
              )}
            </div>
            <div>
              <Label>Search Member</Label>
              <Input placeholder="Search by name or phone..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No members found</p>
              ) : (
                filteredMembers.map((m: any) => (
                  <button
                    key={m.id}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${selectedMemberId === m.id ? "bg-primary/10 text-primary" : ""}`}
                    onClick={() => setSelectedMemberId(m.id)}
                  >
                    <span>{m.name}</span>
                    <span className="text-muted-foreground text-xs">{m.phone}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapTarget(null)}>Cancel</Button>
            <Button
              disabled={!selectedMemberId || mapMutation.isPending}
              onClick={() => mapTarget && mapMutation.mutate({ mappingId: mapTarget.id, memberId: selectedMemberId })}
            >
              {mapMutation.isPending ? "Mapping..." : "Confirm Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Sync Logs Section ───
function SyncLogsSection({ branchId }: { branchId?: string }) {
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["biometric-sync-logs", branchId],
    queryFn: () => fetchBiometricSyncLogs(branchId),
    enabled: !!branchId,
  });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-primary" /> Sync History
          </CardTitle>
          <CardDescription>Recent synchronization logs from biometric devices.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <DocumentTextIcon className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">No sync logs yet. Logs will appear after a device syncs.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Duplicates</TableHead>
                  <TableHead>Unmapped</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatTime(l.synced_at)}</TableCell>
                    <TableCell className="font-medium">{l.biometric_devices?.device_name || "—"}</TableCell>
                    <TableCell>
                      {l.sync_status === "success" ? (
                        <Badge className="bg-green-500/10 text-green-600 border-green-200">Success</Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-600 border-red-200">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{l.logs_received}</TableCell>
                    <TableCell className="tabular-nums">{l.logs_processed}</TableCell>
                    <TableCell className="tabular-nums">{l.logs_duplicated}</TableCell>
                    <TableCell className="tabular-nums">{l.logs_unmapped > 0 ? <span className="text-orange-600">{l.logs_unmapped}</span> : l.logs_unmapped}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-40 truncate">{l.error_message || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
