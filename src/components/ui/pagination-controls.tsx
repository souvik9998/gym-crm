import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  pageSizeOptions: number[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  showPageSizeSelector?: boolean;
  compact?: boolean;
}

export const PaginationControls = memo(({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  pageSizeOptions,
  hasNextPage,
  hasPrevPage,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = true,
  compact = false,
}: PaginationControlsProps) => {
  if (totalItems === 0) return null;

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-4"} flex-wrap`}>
      {/* Items info */}
      <div className="text-sm text-muted-foreground flex-1 min-w-[120px]">
        Showing {startIndex}-{endIndex} of {totalItems}
      </div>

      {/* Page size selector */}
      {showPageSizeSelector && !compact && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(parseInt(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        {!compact && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={!hasPrevPage}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrevPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {/* Page indicator */}
        <div className="px-2 text-sm text-muted-foreground min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!compact && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={!hasNextPage}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
});

PaginationControls.displayName = "PaginationControls";

/**
 * Load more button for infinite scroll
 */
interface LoadMoreButtonProps {
  onClick: () => void;
  hasMore: boolean;
  loadedCount: number;
  totalCount: number;
  isLoading?: boolean;
}

export const LoadMoreButton = memo(({
  onClick,
  hasMore,
  loadedCount,
  totalCount,
  isLoading = false,
}: LoadMoreButtonProps) => {
  if (!hasMore) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <p className="text-sm text-muted-foreground">
        Showing {loadedCount} of {totalCount}
      </p>
      <Button
        variant="outline"
        onClick={onClick}
        disabled={isLoading}
        className="min-w-[120px]"
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        ) : (
          "Load More"
        )}
      </Button>
    </div>
  );
});

LoadMoreButton.displayName = "LoadMoreButton";
