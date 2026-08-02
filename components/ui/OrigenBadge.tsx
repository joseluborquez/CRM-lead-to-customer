import { MessageCircle, FileText, Hand, Target } from 'lucide-react'
import type { OrigenLead } from '@/lib/types'

const ESTILOS: Record<OrigenLead, { fg: string; bg: string; Icono: typeof MessageCircle }> = {
  'WhatsApp Agente': { fg: 'var(--success)', bg: 'var(--success-soft)', Icono: MessageCircle },
  Formulario: { fg: 'var(--cold)', bg: 'var(--cold-soft)', Icono: FileText },
  Manual: { fg: 'var(--text-secondary)', bg: 'var(--bg-hover)', Icono: Hand },
  Outbound: { fg: 'var(--accent-violet)', bg: 'var(--accent-violet-soft)', Icono: Target },
}

export function OrigenBadge({ origen, size = 'md' }: { origen: OrigenLead; size?: 'sm' | 'md' }) {
  const estilo = ESTILOS[origen] ?? ESTILOS.Manual
  const { Icono } = estilo

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
      style={{
        background: estilo.bg,
        color: estilo.fg,
        fontSize: size === 'sm' ? '10px' : '11px',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
      }}
      title={`Origen: ${origen}`}
    >
      <Icono size={size === 'sm' ? 10 : 12} />
      {origen === 'WhatsApp Agente' ? 'Agente WA' : origen}
    </span>
  )
}
