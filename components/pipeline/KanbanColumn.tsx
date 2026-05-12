'use client'

import { useDroppable } from '@dnd-kit/core'
import type { Lead, EstadoLead } from '@/lib/types'
import { LeadCard } from './LeadCard'

interface ColumnConfig {
  label: string
  color: string
  dotColor: string
}

const COLUMN_CONFIG: Record<string, ColumnConfig> = {
  Nuevo: { label: 'Nuevo', color: 'var(--text-secondary)', dotColor: '#888' },
  Contactado: { label: 'Contactado', color: 'var(--cold)', dotColor: 'var(--cold)' },
  'En Nurturing': { label: 'En Nurturing', color: 'var(--warm)', dotColor: 'var(--warm)' },
  'Reunión Agendada': { label: 'Reunión Agendada', color: 'var(--accent-violet)', dotColor: 'var(--accent-violet)' },
  'Propuesta Enviada': { label: 'Propuesta Enviada', color: 'var(--hot)', dotColor: 'var(--hot)' },
  'Cerrado Ganado': { label: 'Cerrado Ganado', color: 'var(--success)', dotColor: 'var(--success)' },
  'Cerrado Perdido': { label: 'Cerrado Perdido', color: 'var(--ultra-hot)', dotColor: 'var(--ultra-hot)' },
  Descalificado: { label: 'Descalificado', color: 'var(--text-muted)', dotColor: 'var(--text-muted)' },
}

interface KanbanColumnProps {
  estado: EstadoLead
  leads: Lead[]
}

export function KanbanColumn({ estado, leads }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })
  const cfg = COLUMN_CONFIG[estado] ?? { label: estado, color: 'var(--text-secondary)', dotColor: '#888' }

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ width: '280px' }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-lg mb-0"
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: cfg.dotColor }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>
        <span
          className="text-xs px-1.5 py-0.5 rounded-md"
          style={{
            background: 'var(--bg-hover)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-geist-mono)',
          }}
        >
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-1 p-2 flex-1 rounded-b-lg min-h-40 transition-all duration-150"
        style={{
          background: isOver ? 'var(--accent-violet-soft)' : 'var(--bg-surface)',
          border: `1px solid ${isOver ? 'var(--accent-violet)' : 'var(--border)'}`,
          borderTop: 'none',
        }}
      >
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}

        {leads.length === 0 && (
          <div
            className="flex items-center justify-center py-6 text-xs rounded-md"
            style={{
              color: 'var(--text-muted)',
              border: `1px dashed ${isOver ? 'var(--accent-violet)' : 'var(--border)'}`,
            }}
          >
            Arrastra aquí
          </div>
        )}
      </div>
    </div>
  )
}
