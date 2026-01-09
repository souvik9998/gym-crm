import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
}

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: "promotional",
    name: "Promotional Message",
    description: "Special offers and promotions",
    template: `🎉 *Special Offer for You!*

Hi {name}, 👋

We have exciting offers waiting for you at Pro Plus Fitness! 💪

✨ Get 20% off on 3-month memberships
✨ Free PT session with annual plans
✨ Refer a friend & get 1 week free!

Visit us today or reply to this message to know more.

Stay fit, stay strong! 🔥
— Team Pro Plus Fitness`,
  },
  {
    id: "expiry_reminder",
    name: "Expiry Reminder",
    description: "Membership expiry notification",
    template: `⚠️ *Subscription Expiry Reminder*

Hi {name}, 👋

Your gym membership expires in {days} days ({expiry_date}).

Don't let your fitness journey pause! Renew now to continue your progress 💪

Visit the gym or reply to renew.
— Team Pro Plus Fitness`,
  },
  {
    id: "renewal_confirmation",
    name: "Renewal Confirmation",
    description: "Sent after membership renewal",
    template: `✅ *Membership Renewed Successfully!*

Hi {name}, 👋

Your gym membership has been renewed till {expiry_date}.

Let's stay consistent and keep pushing towards your fitness goals 💪🔥

See you at the gym!
— Team Pro Plus Fitness`,
  },
  {
    id: "payment_receipt",
    name: "Payment Receipt",
    description: "Last payment details",
    template: `🧾 *Payment Receipt*

Hi {name}, 👋

Here are your last payment details:

💰 *Amount:* ₹{amount}
📅 *Date:* {payment_date}
💳 *Mode:* {payment_mode}

Your membership is valid till {expiry_date}.

Thank you for being with us! 🙏
— Team Pro Plus Fitness`,
  },
  {
    id: "welcome",
    name: "Welcome Message",
    description: "New member welcome",
    template: `🎉 *Welcome to Pro Plus Fitness!*

Hi {name}, 👋

We're thrilled to have you as part of our fitness family! 🏋️

Your membership is now active till {expiry_date}.

💪 Tips to get started:
• Visit during non-peak hours (6-8 AM or 8-10 PM)
• Ask our trainers for a workout plan
• Stay hydrated and consistent!

See you at the gym! Let's crush those goals! 🔥
— Team Pro Plus Fitness`,
  },
  {
    id: "pt_reminder",
    name: "PT Session Reminder",
    description: "Personal training reminder",
    template: `🏋️ *Personal Training Reminder*

Hi {name}, 👋

Your Personal Training sessions are active till {expiry_date}.

Make sure you're utilizing your sessions to the fullest! Your trainer is ready to help you achieve your goals 💪

Book your next session today!
— Team Pro Plus Fitness`,
  },
];

export const WhatsAppTemplates = () => {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customMessage, setCustomMessage] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleTemplateSelect = (template: MessageTemplate) => {
    setSelectedTemplate(template.id);
    setCustomMessage(template.template);
  };

  const handleCopyTemplate = (template: MessageTemplate) => {
    navigator.clipboard.writeText(template.template);
    setCopiedId(template.id);
    toast({ title: "Template copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveCustomMessage = () => {
    // Store in localStorage for now - could be extended to database
    localStorage.setItem("whatsapp_custom_template", customMessage);
    toast({ title: "Custom message saved", description: "You can use this message when sending promotional messages" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-accent" />
            Message Templates
          </CardTitle>
          <CardDescription>
            Pre-built message templates for different scenarios. Click to load into the editor below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MESSAGE_TEMPLATES.map((template) => (
              <div
                key={template.id}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  selectedTemplate === template.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-sm">{template.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyTemplate(template);
                    }}
                  >
                    {copiedId === template.id ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {selectedTemplate === template.id && (
                  <Badge className="mt-2 text-xs" variant="secondary">
                    Selected
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Message Editor</CardTitle>
          <CardDescription>
            Edit the selected template or write your own custom message. Use placeholders like {"{name}"}, {"{expiry_date}"}, {"{days}"}, {"{amount}"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Message Content</Label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Write your custom message here..."
              className="min-h-[250px] font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {"{name}"} = Member name
            </Badge>
            <Badge variant="outline" className="text-xs">
              {"{expiry_date}"} = Expiry date
            </Badge>
            <Badge variant="outline" className="text-xs">
              {"{days}"} = Days remaining
            </Badge>
            <Badge variant="outline" className="text-xs">
              {"{amount}"} = Payment amount
            </Badge>
            <Badge variant="outline" className="text-xs">
              {"{payment_date}"} = Payment date
            </Badge>
            <Badge variant="outline" className="text-xs">
              {"{payment_mode}"} = Cash/Online
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveCustomMessage} disabled={!customMessage.trim()}>
              Save as Custom Template
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(customMessage);
                toast({ title: "Message copied to clipboard" });
              }}
              disabled={!customMessage.trim()}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Message
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to Send Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>From Member Table:</strong> Click the three-dot menu (⋮) on any member row to access WhatsApp messaging options:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Send Promotional Message</strong> - Available for all members</li>
            <li><strong>Send Expiry Reminder</strong> - Available for expiring/expired members</li>
            <li><strong>Send Payment Details</strong> - Sends last payment receipt</li>
          </ul>
          <p className="mt-4">
            <strong>Automatic Messages:</strong> The system automatically sends:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Renewal confirmation when membership is renewed</li>
            <li>PT extension confirmation when personal training is extended</li>
            <li>Daily reminders to expiring members (via scheduled job)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
