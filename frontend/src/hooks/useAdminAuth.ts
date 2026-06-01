import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { loginSchema, meSchema, type LoginInput, type Me } from "@/lib/zod";

const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_KEY,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      try {
        return await api({ path: "/api/auth/me", schema: meSchema });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      // Re-validate on client too — react-hook-form already ensures format,
      // but this protects against direct mutation calls.
      const parsed = loginSchema.parse(input);
      return api({
        method: "POST",
        path: "/api/auth/login",
        body: parsed,
        schema: meSchema,
      });
    },
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api({ method: "POST", path: "/api/auth/logout" }),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries();
    },
  });
}
