import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn `cn` helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
