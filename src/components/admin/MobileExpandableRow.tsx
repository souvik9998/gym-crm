import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface MobileExpandableRowProps {
  /** Content shown when collapsed */
  collapsedContent: React.ReactNode;
  /** Content shown when expanded */
  expandedContent: React.ReactNode;
  /** Additional class for the row container */
  className?: string;
  /** Handler called when row is clicked */
  onClick?: () => void;
  /** Whether to show the chevron indicator */
  showIndicator?: boolean;
}

const MobileExpandableRow = ({
  collapsedContent,
  expandedContent,
  className,
  onClick,
  showIndicator = true,
}: MobileExpandableRowProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen && onClick) {
      onClick();
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            "p-3 border-b bg-card cursor-pointer hover:bg-muted/50 transition-colors",
            isOpen && "bg-muted/30",
            className
          )}
          onClick={handleToggle}
        >
          <div className="flex items-start gap-2">
            {showIndicator && (
              <div className="mt-0.5 flex-shrink-0 text-muted-foreground">
                {isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">{collapsedContent}</div>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1 border-b bg-muted/20">
          {expandedContent}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default MobileExpandableRow;
