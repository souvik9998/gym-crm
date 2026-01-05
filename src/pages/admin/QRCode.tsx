import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Copy, Check, Dumbbell, QrCode, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

const QRCodePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [gymName, setGymName] = useState("Pro Plus Fitness");

  // Generate the portal URL
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "";

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/admin/login");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/admin/login");
      }
      setIsLoading(false);
    });

    // Fetch gym name
    supabase.from("gym_settings").select("gym_name").limit(1).maybeSingle().then(({ data }) => {
      if (data?.gym_name) {
        setGymName(data.gym_name);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      toast({ title: "Link copied to clipboard!" });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: "Failed to copy", variant: "destructive" });
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
    toast({ title: "QR Code downloaded!" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/admin/dashboard")}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <QrCode className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    QR Code Generator
                  </h1>
                  <p className="text-xs text-muted-foreground">Member Registration Portal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* QR Code Card */}
          <Card className="border">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-semibold">{gymName}</CardTitle>
              <CardDescription>
                Scan this QR code to register or renew your membership
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-6">
              {/* QR Code */}
              <div className="p-6 bg-card rounded-2xl shadow-lg border">
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
              <div className="flex items-center gap-2 text-accent">
                <Dumbbell className="w-6 h-6" />
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
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(portalUrl, "_blank")}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Download Button */}
              <Button
                variant="accent"
                size="lg"
                className="w-full max-w-xs"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-2" />
                Download QR Code
              </Button>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card className="border">
            <CardHeader>
              <CardTitle className="text-lg">How to Use</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold">1</span>
                </div>
                <div>
                  <p className="font-medium">Print the QR Code</p>
                  <p className="text-sm text-muted-foreground">
                    Download and print the QR code to display at your gym entrance or reception
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold">2</span>
                </div>
                <div>
                  <p className="font-medium">Members Scan the Code</p>
                  <p className="text-sm text-muted-foreground">
                    Members use their phone camera to scan and open the registration portal
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent font-bold">3</span>
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
      </main>
    </div>
  );
};

export default QRCodePage;
