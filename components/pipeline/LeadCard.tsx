'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Building2, Bell } from 'lucide-react'
import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'

interface LeadCardProps {
  lead: Lead
}

function isFollowUpHoy(proximo: string | null): boolean {
  if (!proximo) return false
  const hoy = new Date()
  const fecha = new Date(proximo)
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  )
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return null
  let color = 'var(--cold)'
  if (score >= 25) color = 'var(--ultra-hot)'
  else if (score >= 18) color = 'var(--hot)'
  else if (score >= 12) color = 'var(--warm)'

  return (
    <span
      style={{
        color,
        fontFamily: 'var(--font-geist-mono)',
        fontSize: '13px',
        fontWeight: 700,
      }}
    >
      {score}
    </span>
  )
}

export function LeadCard({ lead }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })

  const followUpHoy = isFollowUpHoy(lead.proximo_seguimiento)

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="p-3 rounded-lg transition-all duration-150 group"
      onMouseEnter={(e) => {
        if (!isDragging) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!isDragging) e.currentTarget.style.background = 'var(--bg-card)'
      }}
    >
      <div
        className="p-3 rounded-lg flex flex-col gap-2"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="text-sm font-medium leading-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {lead.nombre_lead}
            </span>
            {lead.nombre_empresa && (
              <div className="flex items-center gap-1">
                <Building2 size={10} style={{ color: 'var(--text-muted)' }} />
                <span
                  className="text-xs truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {lead.nombre_empresa}
                </span>
              </div>
            )}
          </div>
          {followUpHoy && (
            <span
              className="shrink-0 flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--ultra-hot-soft)', color: 'var(--ultra-hot)' }}
            >
              <Bell size={10} />
            </span>
          )}
        </div>

        {/* Badges row */}
        <div className="flex items-center justify-between gap-2">
          <TipoBadge tipo={lead.tipo_lead} size="sm" />
          <ScoreChip score={lead.puntuacion_lead} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          {lead.industria_empresa && (
            <span
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {lead.industria_empresa}
            </span>
          )}
          {lead.fecha_captura && (
            <span
              className="text-xs ml-auto"
              style={{ color: 'var(--text-muted)' }}
            >
              {formatDistanceToNow(new Date(lead.fecha_captura), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          )}
        </div>

        {/* Link — stops drag propagation */}
        <Link
          href={`/leads/${lead.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-center py-1 rounded-md transition-all duration-150"
          style={{
            background: 'var(--accent-violet-soft)',
            color: 'var(--accent-violet)',
          }}
        >
          Ver detalle
        </Link>
      </div>
    </div>
  )
}
