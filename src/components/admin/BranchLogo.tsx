import { cn } from "@/lib/utils";

interface BranchLogoProps {
  logoUrl?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
};

function getInitials(name: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const BranchLogo = ({ logoUrl, name, size = "md", className }: BranchLogoProps) => {
  const sizeClass = sizeMap[size];

  if (logoUrl) {
    return (
      <div className={cn("rounded-xl overflow-hidden flex-shrink-0 shadow-sm", sizeClass, className)}>
        <img src={logoUrl} alt={`${name} logo`} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl flex-shrink-0 shadow-sm flex items-center justify-center bg-primary text-primary-foreground font-bold",
        sizeClass,
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
};

export default BranchLogo;
