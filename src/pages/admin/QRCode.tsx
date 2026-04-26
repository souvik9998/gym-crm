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
import { useTenantPrimaryDomain } from "@/hooks/useTenantPrimaryDomain";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { LockClosedIcon } from "@heroicons/react/24/outline";

const QRCodePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"registration" | "attendance">("registration");
  const { branches, currentBranch, isLoading: branchesLoading } = useBranch();
  const { data: customDomain } = useTenantPrimaryDomain(currentBranch?.id);
  const { tenantPermissions, isSuperAdmin } = useAuth();
  const qrAttendanceEnabled = isSuperAdmin || tenantPermissions.attendance_qr;

  const getPortalUrl = () => {
    if (!currentBranch || typeof window === "undefined") return "";
    const slug = (currentBranch as any).slug || currentBranch.id;
    // Always include /b/{slug} so the URL is explicit and works whether the
    // custom domain is bound to a tenant (multi-branch) or a single branch.
    if (customDomain?.hostname) {
      return `https://${customDomain.hostname}/b/${slug}`;
    }
    return `${window.location.origin}/b/${slug}`;
  };

  const getAttendanceUrl = () => {
    if (!currentBranch || typeof window === "undefined") return "";
    const slug = (currentBranch as any).slug || currentBranch.id;
    if (customDomain?.hostname) {
      return `https://${customDomain.hostname}/check-in?branch=${slug}`;
    }
    return `${window.location.origin}/check-in?branch=${slug}`;
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

  // Show skeleton while branch data is loading to avoid a blank page flash
  if (branchesLoading && !currentBranch) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8 animate-fade-in">
        <div className="flex gap-3">
          <div className="flex-1 h-20 rounded-2xl bg-muted/40 animate-pulse" />
          <div className="flex-1 h-20 rounded-2xl bg-muted/30 animate-pulse" />
        </div>
        <Card className="border border-border/60 shadow-sm overflow-hidden">
          <CardContent className="flex flex-col items-center space-y-6 py-10">
            <div className="h-6 w-48 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-4 w-64 rounded-md bg-muted/30 animate-pulse" />
            <div className="w-[240px] h-[240px] lg:w-[300px] lg:h-[300px] rounded-2xl bg-muted/40 animate-pulse" />
            <div className="h-10 w-full max-w-sm rounded-xl bg-muted/30 animate-pulse" />
            <div className="h-11 w-44 rounded-xl bg-muted/40 animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

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

  // Guard: if QR attendance is disabled, force the user back to the
  // Registration tab so the attendance QR can never be viewed/downloaded.
  const effectiveTab: "registration" | "attendance" =
    activeTab === "attendance" && !qrAttendanceEnabled ? "registration" : activeTab;

  return (
    <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8">
      {customDomain?.hostname && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 animate-fade-in">
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">Branded link</Badge>
          <span className="text-sm text-emerald-900 dark:text-emerald-200">
            Using your custom domain <span className="font-mono font-semibold">{customDomain.hostname}</span>
          </span>
        </div>
      )}

      {!qrAttendanceEnabled && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-muted/40 animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <LockClosedIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">QR-based attendance is disabled</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Your plan does not include QR check-in. Contact your administrator to enable this module.
            </p>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-3 animate-fade-in">
        {tabs.map((tab) => {
          const isLocked = tab.id === "attendance" && !qrAttendanceEnabled;
          const isActive = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (isLocked) {
                  toast.error("QR-based attendance is disabled for your plan.");
                  return;
                }
                setActiveTab(tab.id);
              }}
              disabled={isLocked}
              aria-disabled={isLocked}
              title={isLocked ? "QR-based attendance is disabled" : undefined}
              className={cn(
                "flex-1 flex items-center gap-3 p-4 rounded-2xl border transition-all duration-300 text-left",
                isActive
                  ? "bg-primary/5 border-primary/20 shadow-sm"
                  : "bg-card border-border/50 hover:border-border hover:shadow-sm",
                isLocked && "opacity-50 cursor-not-allowed hover:border-border/50 hover:shadow-none"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 relative",
                isActive ? "bg-primary/10" : "bg-muted/50"
              )}>
                <tab.icon className={cn(
                  "w-5 h-5 transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                {isLocked && (
                  <LockClosedIcon className="w-3 h-3 text-muted-foreground absolute -top-0.5 -right-0.5 bg-background rounded-full p-[1px]" />
                )}
              </div>
              <div className="text-left">
                <p className={cn(
                  "font-semibold text-sm transition-colors duration-300",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}>
                  {tab.label}
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {isLocked ? "Disabled by admin" : tab.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* QR Code Display */}
      <div className="animate-fade-in" style={{ animationDelay: "50ms" }}>
        <Card className="border border-border/60 shadow-sm overflow-hidden">
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
                <div className="p-6 lg:p-8 bg-white rounded-2xl border border-border/60 shadow-sm">
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
