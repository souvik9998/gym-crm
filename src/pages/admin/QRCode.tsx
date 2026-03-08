import { useState } from "react";
import { BranchLogo } from "@/components/admin/BranchLogo";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  QrCodeIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { useBranch } from "@/contexts/BranchContext";
import { cn } from "@/lib/utils";

const QRCodePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"registration" | "attendance">("registration");
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
      <div className="max-w-2xl mx-auto animate-fade-in">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
              <BuildingOffice2Icon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Branches Configured</h3>
            <p className="text-muted-foreground mb-6">
              Please add a branch in Settings first to generate QR codes.
            </p>
            <Button onClick={() => navigate("/admin/settings")} className="rounded-xl">
              Go to Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const portalUrl = getPortalUrl();
  const attendanceUrl = getAttendanceUrl();

  const tabs = [
    { id: "registration" as const, label: "Registration", icon: UserGroupIcon, description: "New member signup" },
    { id: "attendance" as const, label: "Attendance", icon: QrCodeIcon, description: "Daily check-in" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8">
      {/* Tab Switcher */}
      <div className="flex gap-3 animate-fade-in">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center gap-3 p-4 rounded-2xl border transition-all duration-300",
              activeTab === tab.id
                ? "bg-primary/5 border-primary/20 shadow-sm"
                : "bg-card border-border/50 hover:border-border hover:shadow-sm"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300",
              activeTab === tab.id ? "bg-primary/10" : "bg-muted/50"
            )}>
              <tab.icon className={cn(
                "w-5 h-5 transition-colors duration-300",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div className="text-left">
              <p className={cn(
                "font-semibold text-sm transition-colors duration-300",
                activeTab === tab.id ? "text-foreground" : "text-muted-foreground"
              )}>
                {tab.label}
              </p>
              <p className="text-xs text-muted-foreground hidden sm:block">{tab.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* QR Code Display */}
      <div className="animate-fade-in" style={{ animationDelay: "50ms" }}>
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.03]">
            <CardHeader className="text-center pb-2 pt-8">
              <div className="flex items-center justify-center gap-2 mb-3">
                <BranchLogo logoUrl={currentBranch.logo_url} name={currentBranch.name} size="sm" />
                <span className="font-semibold text-foreground">{currentBranch.name}</span>
              </div>
              <CardTitle className="text-xl lg:text-2xl font-bold">
                {activeTab === "registration" ? "Member Registration" : "Attendance Check-in"}
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                {activeTab === "registration"
                  ? "Scan to register as a new member"
                  : "Scan to mark your attendance"}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col items-center space-y-6 pb-8">
              {/* QR Code with decorative frame */}
              <div className="relative">
                <div className="p-6 lg:p-8 bg-white rounded-2xl border border-border/30">
                  {activeTab === "registration" ? (
                    <QRCodeSVG id="qr-code-svg-registration" value={portalUrl} size={220} level="H" includeMargin className="w-[200px] h-[200px] lg:w-[280px] lg:h-[280px]" />
                  ) : (
                    <QRCodeSVG id="qr-code-svg-attendance" value={attendanceUrl} size={220} level="H" includeMargin className="w-[200px] h-[200px] lg:w-[280px] lg:h-[280px]" />
                  )}
                </div>
              </div>

              {/* URL Input */}
              <div className="w-full max-w-sm lg:max-w-md space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {activeTab === "registration" ? "Portal URL" : "Attendance URL"}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={activeTab === "registration" ? portalUrl : attendanceUrl}
                    readOnly
                    className="font-mono text-xs h-10 bg-muted/30 border-border/50 rounded-xl"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(
                      activeTab === "registration" ? portalUrl : attendanceUrl,
                      activeTab === "registration" ? "reg" : "att"
                    )}
                    className="flex-shrink-0 h-10 w-10 rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                  >
                    {copied === (activeTab === "registration" ? "reg" : "att")
                      ? <CheckIcon className="w-4 h-4 text-primary" />
                      : <ClipboardDocumentIcon className="w-4 h-4" />}
                  </Button>
                  {activeTab === "registration" && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(portalUrl, "_blank")}
                      className="flex-shrink-0 h-10 w-10 rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Download Button */}
              <Button
                size="lg"
                className="gap-2.5 rounded-xl px-8 lg:px-10 lg:h-12 lg:text-base transition-all duration-300 active:scale-95"
                onClick={() =>
                  handleDownload(
                    activeTab === "registration" ? "qr-code-svg-registration" : "qr-code-svg-attendance",
                    `${activeTab === "registration" ? "qr" : "attendance-qr"}-${currentBranch.name.toLowerCase().replace(/\s+/g, "-")}.png`
                  )
                }
              >
                <ArrowDownTrayIcon className="w-4.5 h-4.5" />
                Download QR Code
              </Button>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* How it Works — only for attendance */}
      {activeTab === "attendance" && (
        <div className="animate-fade-in" style={{ animationDelay: "100ms" }}>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">How Attendance Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {[
                  { step: "1", title: "First Visit", desc: "Member enters phone number to register their device." },
                  { step: "2", title: "Daily Scan", desc: "Scan QR on arrival — attendance is marked instantly." },
                  { step: "3", title: "Check Out", desc: "Scan again when leaving to log total hours." },
                ].map((item, i) => (
                  <div
                    key={item.step}
                    className="flex items-start gap-4 p-3 rounded-xl hover:bg-muted/30 transition-colors duration-200"
                    style={{ animationDelay: `${150 + i * 50}ms` }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary font-bold text-sm">{item.step}</span>
                    </div>
                    <div className="pt-0.5">
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default QRCodePage;
