import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { toast } from "@/components/ui/sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";

const QRCodePage = () => {
  const [copied, setCopied] = useState(false);
  const [gymName, setGymName] = useState("Pro Plus Fitness");

  // Generate the portal URL
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";

  useEffect(() => {
    // Fetch gym name
    supabase.from("gym_settings").select("gym_name").limit(1).maybeSingle().then(({ data }) => {
      if (data?.gym_name) {
        setGymName(data.gym_name);
      }
    });
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const handleDownload = () => {
    const svg = document.getElementById("qr-code-svg");
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
        downloadLink.download = "pro-plus-fitness-qr.png";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    toast.success("QR Code downloaded!");
  };

  return (
    <AdminLayout title="QR Code" subtitle="Member Registration Portal">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* QR Code Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-semibold">{gymName}</CardTitle>
            <CardDescription>
              Scan this QR code to register or renew your membership
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            {/* QR Code */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border">
              <QRCodeSVG
                id="qr-code-svg"
                value={portalUrl}
                size={256}
                level="H"
                includeMargin
                imageSettings={{
                  src: "",
                  height: 0,
                  width: 0,
                  excavate: false,
                }}
              />
            </div>

            {/* Gym logo placeholder */}
            <div className="flex items-center gap-2 text-primary">
              <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
              <span className="font-semibold text-lg">{gymName}</span>
            </div>

            {/* URL Display */}
            <div className="w-full">
              <label className="text-sm text-muted-foreground mb-2 block">Portal URL</label>
              <div className="flex gap-2">
                <Input
                  value={portalUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleCopy} className="flex-shrink-0">
                  {copied ? (
                    <CheckIcon className="w-4 h-4 text-success" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(portalUrl, "_blank")}
                  className="flex-shrink-0"
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Download Button */}
            <Button
              size="lg"
              className="w-full max-w-xs gap-2"
              onClick={handleDownload}
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Download QR Code
            </Button>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium">Print the QR Code</p>
                <p className="text-sm text-muted-foreground">
                  Download and print the QR code to display at your gym entrance or reception
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium">Members Scan the Code</p>
                <p className="text-sm text-muted-foreground">
                  Members use their phone camera to scan and open the registration portal
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium">Complete Payment</p>
                <p className="text-sm text-muted-foreground">
                  New and existing members can register or renew their membership online
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default QRCodePage;
