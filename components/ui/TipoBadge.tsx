import type { TipoLead } from '@/lib/types'

const CONFIG: Record<TipoLead, { bg: string; color: string; dotColor: string; pulse: boolean }> = {
  'Ultra Hot': {
    bg: 'var(--ultra-hot-soft)',
    color: 'var(--ultra-hot)',
    dotColor: 'var(--ultra-hot)',
    pulse: true,
  },
  Hot: {
    bg: 'var(--hot-soft)',
    color: 'var(--hot)',
    dotColor: 'var(--hot)',
    pulse: false,
  },
  Warm: {
    bg: 'var(--warm-soft)',
    color: 'var(--warm)',
    dotColor: 'var(--warm)',
    pulse: false,
  },
  Cold: {
    bg: 'var(--cold-soft)',
    color: 'var(--cold)',
    dotColor: 'var(--cold)',
    pulse: false,
  },
}

interface TipoBadgeProps {
  tipo: TipoLead | null
  size?: 'sm' | 'md'
}

export function TipoBadge({ tipo, size = 'md' }: TipoBadgeProps) {
  if (!tipo) return null

  const cfg = CONFIG[tipo]
  const fontSize = size === 'sm' ? '10px' : '11px'
  const padding = size === 'sm' ? '2px 6px' : '3px 8px'

  return (
    <span
      className="inline-flex items-center gap-1.5 font-medium rounded-md"
      style={{
        background: cfg.bg,
        color: cfg.color,
        fontSize,
        padding,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className={`rounded-full shrink-0 ${cfg.pulse ? 'pulse-dot' : ''}`}
        style={{
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
          background: cfg.dotColor,
          display: 'inline-block',
        }}
      />
      {tipo}
    </span>
  )
}
