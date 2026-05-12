import { useCallback, useRef } from 'react'

export function useDebounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fn(...args), delay)
    },
    [fn, delay]
  )
}
