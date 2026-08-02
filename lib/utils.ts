import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { UMBRALES } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Color del score según su temperatura.
 *
 * Estaba duplicado en 5 componentes con los umbrales escritos a mano, así
 * que al recalibrar el scoring quedaban todos mostrando colores del modelo
 * viejo. Ahora salen de UMBRALES, que a su vez debe coincidir con
 * clasificar_tipo_lead() en Postgres.
 */
export function colorDeScore(score: number | null | undefined): string {
  const s = score ?? 0
  if (s >= UMBRALES.ultraHot) return 'var(--ultra-hot)'
  if (s >= UMBRALES.hot) return 'var(--hot)'
  if (s >= UMBRALES.warm) return 'var(--warm)'
  return 'var(--cold)'
}
