import { useState, useMemo, useCallback } from "react";

interface PaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

interface PaginationResult<T> {
  // Current page data
  paginatedData: T[];
  // Pagination state
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  // Navigation
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  // Helpers
  hasNextPage: boolean;
  hasPrevPage: boolean;
  startIndex: number;
  endIndex: number;
  pageSizeOptions: number[];
  // Reset
  reset: () => void;
}

/**
 * Hook for client-side pagination
 */
export function usePagination<T>(
  data: T[],
  options: PaginationOptions = {}
): PaginationResult<T> {
  const {
    initialPage = 1,
    initialPageSize = 10,
    pageSizeOptions = [10, 25, 50, 100],
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Ensure current page is valid when data or page size changes
  const validatedCurrentPage = useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      return totalPages;
    }
    if (currentPage < 1 && totalPages > 0) {
      return 1;
    }
    return currentPage;
  }, [currentPage, totalPages]);

  // Calculate paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (validatedCurrentPage - 1) * pageSize;
    return data.slice(startIndex, startIndex + pageSize);
  }, [data, validatedCurrentPage, pageSize]);

  const startIndex = (validatedCurrentPage - 1) * pageSize + 1;
  const endIndex = Math.min(validatedCurrentPage * pageSize, totalItems);

  const hasNextPage = validatedCurrentPage < totalPages;
  const hasPrevPage = validatedCurrentPage > 1;

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [hasNextPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      setCurrentPage((prev) => prev - 1);
    }
  }, [hasPrevPage]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1); // Reset to first page when changing page size
  }, []);

  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    setPageSizeState(initialPageSize);
  }, [initialPage, initialPageSize]);

  return {
    paginatedData,
    currentPage: validatedCurrentPage,
    pageSize,
    totalItems,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    hasNextPage,
    hasPrevPage,
    startIndex: totalItems > 0 ? startIndex : 0,
    endIndex,
    pageSizeOptions,
    reset,
  };
}

/**
 * Hook for infinite scroll / load more pagination
 */
export function useInfiniteScroll<T>(
  data: T[],
  pageSize: number = 20
) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const visibleData = useMemo(
    () => data.slice(0, visibleCount),
    [data, visibleCount]
  );

  const hasMore = visibleCount < data.length;
  const loadedCount = Math.min(visibleCount, data.length);
  const totalCount = data.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, data.length));
  }, [pageSize, data.length]);

  const reset = useCallback(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  return {
    visibleData,
    hasMore,
    loadMore,
    loadedCount,
    totalCount,
    reset,
  };
}
