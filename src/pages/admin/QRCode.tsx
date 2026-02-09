import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { useBranch, type Branch } from "@/contexts/BranchContext";

const QRCodePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const { branches } = useBranch();
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Set first branch as default when branches load
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0]);
    }
  }, [branches, selectedBranch]);

  // Generate the portal URL for a specific branch
  const getPortalUrl = (branch: Branch) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/b/${branch.id}`;
  };

  const handleCopy = async (url: string, branchId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(branchId);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = (branch: Branch) => {
    const svg = document.getElementById(`qr-code-svg-${branch.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = 1024;
      canvas.height = 1024;
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 1024, 1024);
        ctx.drawImage(img, 0, 0, 1024, 1024);

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        const fileName = `qr-${branch.name.toLowerCase().replace(/\s+/g, '-')}.png`;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    toast.success(`QR Code for ${branch.name} downloaded!`);
  };

  if (branches.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <BuildingOffice2Icon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Branches Configured</h3>
              <p className="text-muted-foreground mb-4">
                Please add a branch in Settings first to generate QR codes for member registration.
              </p>
              <Button onClick={() => navigate("/admin/settings")}>
                Go to Settings
              </Button>
            </CardContent>
          </Card>
        </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <Tabs defaultValue="registration">
          <TabsList className="mb-4">
            <TabsTrigger value="registration">Registration QR</TabsTrigger>
            <TabsTrigger value="attendance">Attendance QR</TabsTrigger>
          </TabsList>

          <TabsContent value="registration">
            <Tabs 
              value={selectedBranch?.id || branches[0]?.id} 
              onValueChange={(val) => {
                const branch = branches.find(b => b.id === val);
                if (branch) setSelectedBranch(branch);
              }}
            >
              <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-muted/50 p-1">
                {branches.map((branch) => (
                  <TabsTrigger key={branch.id} value={branch.id} className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{branch.name.charAt(0)}</div>
                    {branch.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {branches.map((branch) => {
                const portalUrl = getPortalUrl(branch);
                return (
                  <TabsContent key={branch.id} value={branch.id} className="space-y-6 mt-6">
                    <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-accent/5">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{branch.name}</h3>
                            {branch.address && <p className="text-sm text-muted-foreground">{branch.address}</p>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="text-center pb-4">
                        <CardTitle className="text-2xl font-semibold">{branch.name}</CardTitle>
                        <CardDescription>Scan this QR code to register at <strong>{branch.name}</strong></CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col items-center space-y-6">
                        <div className="p-6 bg-white rounded-2xl shadow-lg border">
                          <QRCodeSVG id={`qr-code-svg-${branch.id}`} value={portalUrl} size={256} level="H" includeMargin />
                        </div>
                        <div className="flex items-center gap-2 text-primary">
                          <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                          <span className="font-semibold text-lg">{branch.name}</span>
                        </div>
                        <div className="w-full max-w-md">
                          <label className="text-sm text-muted-foreground mb-2 block">Portal URL</label>
                          <div className="flex gap-2">
                            <Input value={portalUrl} readOnly className="font-mono text-sm" />
                            <Button variant="outline" size="icon" onClick={() => handleCopy(portalUrl, branch.id)} className="flex-shrink-0">
                              {copied === branch.id ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => window.open(portalUrl, "_blank")} className="flex-shrink-0">
                              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <Button size="lg" className="w-full max-w-xs gap-2" onClick={() => handleDownload(branch)}>
                          <ArrowDownTrayIcon className="w-4 h-4" /> Download QR Code
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          <TabsContent value="attendance">
            <Tabs 
              value={selectedBranch?.id || branches[0]?.id} 
              onValueChange={(val) => {
                const branch = branches.find(b => b.id === val);
                if (branch) setSelectedBranch(branch);
              }}
            >
              <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-muted/50 p-1">
                {branches.map((branch) => (
                  <TabsTrigger key={branch.id} value={branch.id} className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{branch.name.charAt(0)}</div>
                    {branch.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {branches.map((branch) => {
                const attendanceUrl = `${window.location.origin}/check-in?branch_id=${branch.id}`;
                return (
                  <TabsContent key={branch.id} value={branch.id} className="space-y-6 mt-6">
                    <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-accent/5">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{branch.name} — Attendance</h3>
                            <p className="text-sm text-muted-foreground">Print and display this QR at the gym entrance</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardHeader className="text-center pb-4">
                        <CardTitle className="text-2xl font-semibold">Attendance Check-in</CardTitle>
                        <CardDescription>Members & staff scan this QR to mark attendance at <strong>{branch.name}</strong></CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col items-center space-y-6">
                        <div className="p-6 bg-white rounded-2xl shadow-lg border">
                          <QRCodeSVG id={`qr-attendance-svg-${branch.id}`} value={attendanceUrl} size={256} level="H" includeMargin />
                        </div>
                        <div className="flex items-center gap-2 text-primary">
                          <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                          <span className="font-semibold text-lg">{branch.name}</span>
                        </div>
                        <div className="w-full max-w-md">
                          <label className="text-sm text-muted-foreground mb-2 block">Attendance URL</label>
                          <div className="flex gap-2">
                            <Input value={attendanceUrl} readOnly className="font-mono text-sm" />
                            <Button variant="outline" size="icon" onClick={() => handleCopy(attendanceUrl, `att-${branch.id}`)} className="flex-shrink-0">
                              {copied === `att-${branch.id}` ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                        <Button size="lg" className="w-full max-w-xs gap-2" onClick={() => {
                          const svg = document.getElementById(`qr-attendance-svg-${branch.id}`);
                          if (!svg) return;
                          const svgData = new XMLSerializer().serializeToString(svg);
                          const canvas = document.createElement("canvas");
                          const ctx = canvas.getContext("2d");
                          const img = new Image();
                          img.onload = () => {
                            canvas.width = 1024; canvas.height = 1024;
                            if (ctx) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1024, 1024); ctx.drawImage(img, 0, 0, 1024, 1024); }
                            const pngUrl = canvas.toDataURL("image/png");
                            const dl = document.createElement("a"); dl.href = pngUrl;
                            dl.download = `attendance-qr-${branch.name.toLowerCase().replace(/\s+/g, '-')}.png`;
                            document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
                          };
                          img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                          toast.success(`Attendance QR for ${branch.name} downloaded!`);
                        }}>
                          <ArrowDownTrayIcon className="w-4 h-4" /> Download Attendance QR
                        </Button>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardHeader><CardTitle className="text-lg">How Attendance Works</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-primary font-bold text-sm">1</span></div>
                          <div><p className="font-medium">First Visit</p><p className="text-sm text-muted-foreground">Member enters phone number to register their device.</p></div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-primary font-bold text-sm">2</span></div>
                          <div><p className="font-medium">Daily Scan</p><p className="text-sm text-muted-foreground">Scan QR on arrival — attendance is marked instantly with no login needed.</p></div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-primary font-bold text-sm">3</span></div>
                          <div><p className="font-medium">Check Out</p><p className="text-sm text-muted-foreground">Scan again when leaving to log check-out time and total hours.</p></div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
  );
};

export default QRCodePage;
