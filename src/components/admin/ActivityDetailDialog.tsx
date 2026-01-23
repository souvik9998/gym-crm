import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Calendar,
  User,
  Tag,
  FileText,
  ArrowRight,
  Users,
  IndianRupee,
  Package,
  Dumbbell,
  Settings,
  MessageCircle,
  TrendingUp,
} from "lucide-react";

interface AdminActivityLog {
  id: string;
  admin_user_id: string | null;
  activity_category: string;
  activity_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface ActivityDetailDialogProps {
  activity: AdminActivityLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ActivityDetailDialog = ({ activity, open, onOpenChange }: ActivityDetailDialogProps) => {
  if (!activity) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "members":
        return <Users className="w-5 h-5" />;
      case "payments":
        return <IndianRupee className="w-5 h-5" />;
      case "packages":
        return <Package className="w-5 h-5" />;
      case "trainers":
        return <Dumbbell className="w-5 h-5" />;
      case "settings":
        return <Settings className="w-5 h-5" />;
      case "whatsapp":
        return <MessageCircle className="w-5 h-5" />;
      case "subscriptions":
        return <Calendar className="w-5 h-5" />;
      default:
        return <TrendingUp className="w-5 h-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      members: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      payments: "bg-green-500/10 text-green-500 border-green-500/20",
      packages: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      trainers: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      settings: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      whatsapp: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      subscriptions: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
      relative: getRelativeTime(date),
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return null;
  };

  const formatFieldName = (key: string) => {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return "Not set";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  const renderValueComparison = () => {
    const oldValue = activity.old_value;
    const newValue = activity.new_value;
    const activityType = activity.activity_type || "";

    if (!oldValue && !newValue) return null;

    // Determine operation type from activity_type
    const isAddOperation = activityType.endsWith("_added") || activityType.endsWith("_created");
    const isDeleteOperation = activityType.endsWith("_deleted");
    const isUpdateOperation = activityType.endsWith("_updated") || activityType.endsWith("_toggled") || activityType.endsWith("_changed");

    // Keys to exclude from display (internal/system fields)
    const excludeKeys = [
      'id', 'created_at', 'updated_at', 'branch_id', 'is_active', 
      'is_default', 'admin_user_id', 'staff_id', 'member_id', 'user_id'
    ];

    // Get all unique keys from both objects (excluding internal fields)
    const allKeys = new Set([
      ...(oldValue ? Object.keys(oldValue) : []),
      ...(newValue ? Object.keys(newValue) : []),
    ].filter(key => !excludeKeys.includes(key)));

    // Filter out keys with no changes or irrelevant data
    const changedKeys = Array.from(allKeys).filter((key) => {
      const oldVal = oldValue?.[key];
      const newVal = newValue?.[key];
      return JSON.stringify(oldVal) !== JSON.stringify(newVal);
    });

    // Handle ADD operations
    if (isAddOperation && (!oldValue || Object.keys(oldValue).length === 0) && newValue) {
      const filteredNewValue = Object.fromEntries(
        Object.entries(newValue).filter(([key]) => !excludeKeys.includes(key))
      );
      
      if (Object.keys(filteredNewValue).length === 0) return null;
      
      return (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Added
          </h4>
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
            {Object.entries(filteredNewValue).map(([key, value]) => (
              <div key={key} className="flex justify-between items-start gap-4">
                <span className="text-sm text-muted-foreground">{formatFieldName(key)}:</span>
                <span className="text-sm font-medium text-green-600 text-right max-w-[60%] break-words">
                  {formatFieldValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Handle DELETE operations
    if (isDeleteOperation && oldValue && (!newValue || Object.keys(newValue).length === 0)) {
      const filteredOldValue = Object.fromEntries(
        Object.entries(oldValue).filter(([key]) => !excludeKeys.includes(key))
      );
      
      if (Object.keys(filteredOldValue).length === 0) return null;
      
      return (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Deleted
          </h4>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-2">
            {Object.entries(filteredOldValue).map(([key, value]) => (
              <div key={key} className="flex justify-between items-start gap-4">
                <span className="text-sm text-muted-foreground">{formatFieldName(key)}:</span>
                <span className="text-sm font-medium text-red-600 text-right max-w-[60%] break-words">
                  {formatFieldValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Handle UPDATE operations or fallback for other cases
    if (changedKeys.length === 0) {
      // If no changes detected but we have values, show new values for add operations
      if (isAddOperation && newValue) {
        const filteredNewValue = Object.fromEntries(
          Object.entries(newValue).filter(([key]) => !excludeKeys.includes(key))
        );
        
        if (Object.keys(filteredNewValue).length === 0) return null;
        
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Added
            </h4>
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
              {Object.entries(filteredNewValue).map(([key, value]) => (
                <div key={key} className="flex justify-between items-start gap-4">
                  <span className="text-sm text-muted-foreground">{formatFieldName(key)}:</span>
                  <span className="text-sm font-medium text-green-600 text-right max-w-[60%] break-words">
                    {formatFieldValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }
      return null;
    }

    // Show changes for UPDATE operations
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Changes Made
        </h4>
        <div className="space-y-3">
          {changedKeys.map((key) => {
            const oldVal = oldValue?.[key];
            const newVal = newValue?.[key];
            return (
              <div key={key} className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {formatFieldName(key)}
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                    <p className="text-xs text-red-400 mb-1">Previous</p>
                    <p className="text-sm text-foreground break-words">
                      {formatFieldValue(oldVal)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground mt-4 flex-shrink-0" />
                  <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
                    <p className="text-xs text-green-400 mb-1">New</p>
                    <p className="text-sm text-foreground break-words">
                      {formatFieldValue(newVal)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMetadata = () => {
    if (!activity.metadata || Object.keys(activity.metadata).length === 0) return null;

    // Filter out internal metadata fields
    const excludeMetadataKeys = ['performed_by', 'staff_id'];
    const displayableMetadata = Object.entries(activity.metadata).filter(
      ([key]) => !excludeMetadataKeys.includes(key)
    );

    if (displayableMetadata.length === 0) return null;

    return (
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Additional Details
        </h4>
        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          {displayableMetadata.map(([key, value]) => (
            <div key={key} className="flex justify-between items-start gap-4">
              <span className="text-sm text-muted-foreground">{formatFieldName(key)}:</span>
              <span className="text-sm font-medium text-foreground text-right max-w-[60%] break-words">
                {formatFieldValue(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const { date, time, relative } = formatDateTime(activity.created_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getCategoryColor(activity.activity_category)}`}>
              {getCategoryIcon(activity.activity_category)}
            </div>
            <div>
              <p className="text-lg font-semibold">Activity Details</p>
              <p className="text-sm font-normal text-muted-foreground">
                {activity.activity_type.replace(/_/g, " ")}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Timing Information */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Timing Details
            </h4>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{date}</p>
                  <p className="text-xs text-muted-foreground">Date</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{time}</p>
                  <p className="text-xs text-muted-foreground">Time</p>
                </div>
              </div>
              {relative && (
                <Badge variant="outline" className="text-xs">
                  {relative}
                </Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Activity Description */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Description
            </h4>
            <p className="text-sm text-foreground bg-muted/30 rounded-lg p-4">
              {activity.description}
            </p>
          </div>

          {/* Category and Entity */}
          <div className="flex flex-wrap gap-3">
            <Badge className={getCategoryColor(activity.activity_category)}>
              <span className="flex items-center gap-1">
                {getCategoryIcon(activity.activity_category)}
                {activity.activity_category.charAt(0).toUpperCase() + activity.activity_category.slice(1)}
              </span>
            </Badge>
            {activity.entity_name && (
              <Badge variant="outline" className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {activity.entity_name}
              </Badge>
            )}
          </div>

          {/* Value Changes */}
          {renderValueComparison()}

          {/* Metadata */}
          {renderMetadata()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityDetailDialog;
