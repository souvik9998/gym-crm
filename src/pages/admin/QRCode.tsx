import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { useBranch } from "@/contexts/BranchContext";

const QRCodePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const { branches, currentBranch } = useBranch();

  const getPortalUrl = () => {
    if (!currentBranch || typeof window === "undefined") return "";
    return `${window.location.origin}/b/${currentBranch.id}`;
  };

  const getAttendanceUrl = () => {
    if (!currentBranch || typeof window === "undefined") return "";
    return `${window.location.origin}/check-in?branch_id=${currentBranch.id}`;
  };

  const handleCopy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = (svgId: string, fileName: string) => {
    const svg = document.getElementById(svgId);
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
      }
      const pngUrl = canvas.toDataURL("image/png");
      const dl = document.createElement("a");
      dl.href = pngUrl;
      dl.download = fileName;
      document.body.appendChild(dl);
      dl.click();
      document.body.removeChild(dl);
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    toast.success("QR Code downloaded!");
  };

  if (branches.length === 0 || !currentBranch) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <BuildingOffice2Icon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Branches Configured</h3>
            <p className="text-muted-foreground mb-4">
              Please add a branch in Settings first to generate QR codes for member registration.
            </p>
            <Button onClick={() => navigate("/admin/settings")}>Go to Settings</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const portalUrl = getPortalUrl();
  const attendanceUrl = getAttendanceUrl();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Tabs defaultValue="registration">
        <TabsList className="mb-4">
          <TabsTrigger value="registration">Registration QR</TabsTrigger>
          <TabsTrigger value="attendance">Attendance QR</TabsTrigger>
        </TabsList>

        <TabsContent value="registration" className="space-y-6">
          <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{currentBranch.name}</h3>
                  {currentBranch.address && <p className="text-sm text-muted-foreground">{currentBranch.address}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-semibold">{currentBranch.name}</CardTitle>
              <CardDescription>Scan this QR code to register at <strong>{currentBranch.name}</strong></CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-6">
              <div className="p-6 bg-card rounded-2xl shadow-lg border">
                <QRCodeSVG id="qr-code-svg-registration" value={portalUrl} size={256} level="H" includeMargin />
              </div>
              <div className="flex items-center gap-2 text-primary">
                <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                <span className="font-semibold text-lg">{currentBranch.name}</span>
              </div>
              <div className="w-full max-w-md">
                <label className="text-sm text-muted-foreground mb-2 block">Portal URL</label>
                <div className="flex gap-2">
                  <Input value={portalUrl} readOnly className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(portalUrl, "reg")} className="flex-shrink-0">
                    {copied === "reg" ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => window.open(portalUrl, "_blank")} className="flex-shrink-0">
                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full max-w-xs gap-2"
                onClick={() => handleDownload("qr-code-svg-registration", `qr-${currentBranch.name.toLowerCase().replace(/\s+/g, '-')}.png`)}
              >
                <ArrowDownTrayIcon className="w-4 h-4" /> Download QR Code
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-6">
          <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BuildingOffice2Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{currentBranch.name} — Attendance</h3>
                  <p className="text-sm text-muted-foreground">Print and display this QR at the gym entrance</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-semibold">Attendance Check-in</CardTitle>
              <CardDescription>Members & staff scan this QR to mark attendance at <strong>{currentBranch.name}</strong></CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-6">
              <div className="p-6 bg-card rounded-2xl shadow-lg border">
                <QRCodeSVG id="qr-code-svg-attendance" value={attendanceUrl} size={256} level="H" includeMargin />
              </div>
              <div className="flex items-center gap-2 text-primary">
                <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
                <span className="font-semibold text-lg">{currentBranch.name}</span>
              </div>
              <div className="w-full max-w-md">
                <label className="text-sm text-muted-foreground mb-2 block">Attendance URL</label>
                <div className="flex gap-2">
                  <Input value={attendanceUrl} readOnly className="font-mono text-sm" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(attendanceUrl, "att")} className="flex-shrink-0">
                    {copied === "att" ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full max-w-xs gap-2"
                onClick={() => handleDownload("qr-code-svg-attendance", `attendance-qr-${currentBranch.name.toLowerCase().replace(/\s+/g, '-')}.png`)}
              >
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
      </Tabs>
    </div>
  );
};

export default QRCodePage;
