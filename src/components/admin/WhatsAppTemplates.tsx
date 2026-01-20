import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Copy, Check, Save, Megaphone, Clock, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { logAdminActivity } from "@/hooks/useAdminActivityLog";
import { useBranch } from "@/contexts/BranchContext";
interface MessageTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
}

const PROMOTIONAL_TEMPLATES: MessageTemplate[] = [
  {
    id: "promotional_offer",
    name: "Special Offer",
    description: "Discounts and promotions",
    template: `🎉 *Special Offer for You!*

Hi {name}, 👋

We have exciting offers waiting for you at {branch_name}! 💪

✨ Get 20% off on 3-month memberships
✨ Free PT session with annual plans
✨ Refer a friend & get 1 week free!

Visit us today or reply to this message to know more.

Stay fit, stay strong! 🔥
— Team {branch_name}`,
  },
  {
    id: "promotional_new_service",
    name: "New Service",
    description: "Announce new services or equipment",
    template: `🆕 *Exciting Update!*

Hi {name}, 👋

We're thrilled to announce new additions to {branch_name}! 🏋️

Come check out our latest equipment and services. Your fitness journey just got even better! 💪

Visit us today!
— Team {branch_name}`,
  },
  {
    id: "promotional_event",
    name: "Gym Event",
    description: "Special events or workshops",
    template: `📢 *You're Invited!*

Hi {name}, 👋

Join us for a special event at {branch_name}! 🎯

Don't miss this opportunity to connect with fellow fitness enthusiasts and learn from the best.

Reply to RSVP or visit the gym for details.

See you there! 💪
— Team {branch_name}`,
  },
];

const EXPIRY_REMINDER_TEMPLATES: MessageTemplate[] = [
  {
    id: "expiry_reminder_standard",
    name: "Standard Reminder",
    description: "General expiry notification",
    template: `⚠️ *Subscription Expiry Reminder*

Hi {name}, 👋

Your gym membership expires in {days} days ({expiry_date}).

Don't let your fitness journey pause! Renew now to continue your progress 💪

Visit the gym or reply to renew.
— Team {branch_name}`,
  },
  {
    id: "expiry_reminder_urgent",
    name: "Urgent Reminder",
    description: "Last chance notification",
    template: `🚨 *Membership Expires Soon!*

Hi {name}, 👋

Your gym membership expires in just {days} days on {expiry_date}!

⏰ Don't wait - renew today to avoid interruption.

💪 Keep your fitness momentum going!

Reply or visit us now.
— Team {branch_name}`,
  },
  {
    id: "expiry_reminder_today",
    name: "Expires Today",
    description: "Same-day expiry alert",
    template: `🚨 *Membership Expires Today*

Hi {name}, 👋

Your gym membership expires *today* ({expiry_date}).

Renew now to continue your fitness journey without interruption 🔥

Contact us or visit the gym today.
— Team {branch_name}`,
  },
];

const EXPIRED_REMINDER_TEMPLATES: MessageTemplate[] = [
  {
    id: "expired_reminder_standard",
    name: "Standard Expired Notice",
    description: "Inform about expired membership",
    template: `⛔ *Membership Expired*

Hi {name}, 👋

Your gym membership expired on {expiry_date}.

We miss seeing you at the gym! 💔 Renew now and get back on track with your fitness goals.

🎁 *Special Renewal Offer* - Renew within 7 days and get a discount!

Visit us or reply to renew today.
— Team {branch_name}`,
  },
  {
    id: "expired_reminder_comeback",
    name: "Comeback Offer",
    description: "Entice expired members to return",
    template: `💪 *We Miss You!*

Hi {name}, 👋

Your gym membership expired {days} days ago on {expiry_date}.

Ready to restart your fitness journey? We've got a special comeback offer just for you! 🎉

✨ Renew now and get exclusive benefits
✨ No additional joining fee for returning members

Come back stronger! Visit us today.
— Team {branch_name}`,
  },
  {
    id: "expired_reminder_urgent",
    name: "Final Reminder",
    description: "Last chance before benefits expire",
    template: `⚠️ *Final Reminder - Membership Expired*

Hi {name}, 👋

Your membership expired on {expiry_date}. This is your final reminder before your loyalty benefits reset.

🔔 Renew within the next 7 days to:
• Keep your membership history
• Avoid re-paying joining fee
• Continue your fitness streak

Don't lose your progress! Reply or visit us now.
— Team {branch_name}`,
  },
];

type TemplateCategory = "promotional" | "expiry_reminder" | "expired_reminder";

export const WhatsAppTemplates = () => {
  const { currentBranch } = useBranch();
  const [activeTab, setActiveTab] = useState<TemplateCategory>("promotional");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Separate custom messages for each category
  const [promotionalMessage, setPromotionalMessage] = useState<string>("");
  const [expiryReminderMessage, setExpiryReminderMessage] = useState<string>("");
  const [expiredReminderMessage, setExpiredReminderMessage] = useState<string>("");

  // Helper to get branch-specific localStorage key
  const getBranchTemplateKey = (templateType: string): string => {
    const branchId = currentBranch?.id || "default";
    return `whatsapp_${templateType}_template_${branchId}`;
  };

  // Load saved messages from localStorage on mount or branch change
  useEffect(() => {
    if (!currentBranch?.id) return;
    
    const savedPromotional = localStorage.getItem(getBranchTemplateKey("promotional"));
    const savedExpiryReminder = localStorage.getItem(getBranchTemplateKey("expiry_reminder"));
    const savedExpiredReminder = localStorage.getItem(getBranchTemplateKey("expired_reminder"));
    
    setPromotionalMessage(savedPromotional || "");
    setExpiryReminderMessage(savedExpiryReminder || "");
    setExpiredReminderMessage(savedExpiredReminder || "");
  }, [currentBranch?.id]);

  const getTemplatesForCategory = (category: TemplateCategory): MessageTemplate[] => {
    switch (category) {
      case "promotional":
        return PROMOTIONAL_TEMPLATES;
      case "expiry_reminder":
        return EXPIRY_REMINDER_TEMPLATES;
      case "expired_reminder":
        return EXPIRED_REMINDER_TEMPLATES;
    }
  };

  const getCurrentMessage = (): string => {
    switch (activeTab) {
      case "promotional":
        return promotionalMessage;
      case "expiry_reminder":
        return expiryReminderMessage;
      case "expired_reminder":
        return expiredReminderMessage;
    }
  };

  const setCurrentMessage = (message: string) => {
    switch (activeTab) {
      case "promotional":
        setPromotionalMessage(message);
        break;
      case "expiry_reminder":
        setExpiryReminderMessage(message);
        break;
      case "expired_reminder":
        setExpiredReminderMessage(message);
        break;
    }
  };

  const handleTemplateSelect = (template: MessageTemplate) => {
    setSelectedTemplate(template.id);
    setCurrentMessage(template.template);
  };

  const handleCopyTemplate = (template: MessageTemplate) => {
    navigator.clipboard.writeText(template.template);
    setCopiedId(template.id);
    toast.success("Template copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveCustomMessage = async () => {
    const message = getCurrentMessage();
    const storageKey = getBranchTemplateKey(activeTab);
    const oldMessage = localStorage.getItem(storageKey);
    localStorage.setItem(storageKey, message);
    
    const categoryNames = {
      promotional: "Promotional",
      expiry_reminder: "Expiry Reminder",
      expired_reminder: "Expired Reminder",
    };
    
    await logAdminActivity({
      category: "whatsapp",
      type: "whatsapp_template_saved",
      description: `Saved ${categoryNames[activeTab]} WhatsApp template for ${currentBranch?.name || "branch"}`,
      entityType: "whatsapp_template",
      entityName: categoryNames[activeTab],
      oldValue: oldMessage ? { template: oldMessage.substring(0, 100) + (oldMessage.length > 100 ? "..." : "") } : null,
      newValue: { template: message.substring(0, 100) + (message.length > 100 ? "..." : "") },
      metadata: { template_type: activeTab, full_template_length: message.length },
      branchId: currentBranch?.id,
    });
    
    toast.success(`${categoryNames[activeTab]} template saved`, {
      description: `This message will be used when sending this type of notification for ${currentBranch?.name || "this branch"}`,
    });
  };

  const getCategoryIcon = (category: TemplateCategory) => {
    switch (category) {
      case "promotional":
        return <Megaphone className="w-4 h-4" />;
      case "expiry_reminder":
        return <Clock className="w-4 h-4" />;
      case "expired_reminder":
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getCategoryDescription = (category: TemplateCategory): string => {
    switch (category) {
      case "promotional":
        return "Messages for offers, events, and announcements to all members";
      case "expiry_reminder":
        return "Messages for members whose subscription is about to expire (expiring soon)";
      case "expired_reminder":
        return "Messages for members whose subscription has already expired";
    }
  };

  const templates = getTemplatesForCategory(activeTab);
  const currentMessage = getCurrentMessage();

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplateCategory)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="promotional" className="gap-2">
            <Megaphone className="w-4 h-4" />
            <span className="hidden sm:inline">Promotional</span>
          </TabsTrigger>
          <TabsTrigger value="expiry_reminder" className="gap-2">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Expiry Reminder</span>
          </TabsTrigger>
          <TabsTrigger value="expired_reminder" className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Expired Reminder</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getCategoryIcon(activeTab)}
                {activeTab === "promotional" && "Promotional Templates"}
                {activeTab === "expiry_reminder" && "Expiry Reminder Templates"}
                {activeTab === "expired_reminder" && "Expired Reminder Templates"}
              </CardTitle>
              <CardDescription>{getCategoryDescription(activeTab)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
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
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-accent" />
                Custom {activeTab === "promotional" ? "Promotional" : activeTab === "expiry_reminder" ? "Expiry Reminder" : "Expired Reminder"} Message
              </CardTitle>
              <CardDescription>
                Edit the selected template or write your own. This message will be used when sending {activeTab.replace("_", " ")} notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Message Content</Label>
                <Textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
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
                  {"{days}"} = Days remaining/expired
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {"{branch_name}"} = Branch name
                </Badge>
                {activeTab === "promotional" && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {"{amount}"} = Payment amount
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {"{payment_date}"} = Payment date
                    </Badge>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveCustomMessage} disabled={!currentMessage.trim()}>
                  <Save className="w-4 h-4 mr-2" />
                  Save as {activeTab === "promotional" ? "Promotional" : activeTab === "expiry_reminder" ? "Expiry Reminder" : "Expired Reminder"} Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(currentMessage);
                    toast.success("Message copied to clipboard");
                  }}
                  disabled={!currentMessage.trim()}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Message
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>How to Send Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>From Member Table:</strong> Click the three-dot menu (⋮) on any member row to access WhatsApp messaging options:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Send Promotional Message</strong> - Available for all members (uses Promotional template)</li>
            <li><strong>Send Expiry Reminder</strong> - For members expiring soon (uses Expiry Reminder template)</li>
            <li><strong>Send Expired Reminder</strong> - For members with expired subscriptions (uses Expired Reminder template)</li>
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
