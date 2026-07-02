import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn-style className combiner: merges conditional + conflicting classes. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
