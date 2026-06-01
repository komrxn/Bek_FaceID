import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Errors surface to ErrorBoundary / per-component; don't retry silently.
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
    },
  },
});
