import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download, Share2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import QRCode from "qrcode";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: any;
}

export function EventQRDialog({ open, onOpenChange, event }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const eventUrl = `${window.location.origin}/event/${event.id}`;

  useEffect(() => {
    if (open && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, eventUrl, {
        width: 250,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }
  }, [open, eventUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(eventUrl);
    toast.success("Link copied!");
  };

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${event.title.replace(/\s+/g, "_")}_QR.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
    toast.success("QR code downloaded");
  };

  const shareEvent = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, url: eventUrl });
      } catch {}
    } else {
      copyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Event QR Code & Link</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-white rounded-2xl shadow-sm">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-sm font-medium text-foreground text-center">{event.title}</p>
          <div className="flex items-center gap-2 w-full">
            <Input value={eventUrl} readOnly className="rounded-xl text-xs" />
            <Button size="icon" variant="outline" onClick={copyLink} className="flex-shrink-0 rounded-xl">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2 w-full">
            <Button onClick={downloadQR} variant="outline" className="flex-1 rounded-xl gap-2">
              <Download className="w-4 h-4" /> Download QR
            </Button>
            <Button onClick={shareEvent} className="flex-1 rounded-xl gap-2">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
