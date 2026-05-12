'use client'

import { useState, useCallback } from 'react'
import { DndContext, DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { Lead, EstadoLead } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { updateLeadEstado } from '@/lib/queries'
import { TipoBadge } from '@/components/ui/TipoBadge'

const COLUMNAS: EstadoLead[] = [
  'Nuevo',
  'Contactado',
  'En Nurturing',
  'Reunión Agendada',
  'Propuesta Enviada',
  'Cerrado Ganado',
  'Cerrado Perdido',
]

interface KanbanBoardProps {
  initialLeads: Record<EstadoLead, Lead[]>
}

export function KanbanBoard({ initialLeads }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Record<EstadoLead, Lead[]>>(initialLeads)
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  const activeLead = activeLeadId
    ? Object.values(columns).flat().find((l) => l.id === activeLeadId) ?? null
    : null

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveLeadId(null)
      const { active, over } = event
      if (!over) return

      const leadId = active.id as string
      const newEstado = over.id as EstadoLead

      const currentEstado = Object.entries(columns).find(([, leads]) =>
        leads.some((l) => l.id === leadId)
      )?.[0] as EstadoLead | undefined

      if (!currentEstado || currentEstado === newEstado) return

      // Optimistic update
      setColumns((prev) => {
        const lead = prev[currentEstado].find((l) => l.id === leadId)!
        return {
          ...prev,
          [currentEstado]: prev[currentEstado].filter((l) => l.id !== leadId),
          [newEstado]: [...prev[newEstado], { ...lead, estado: newEstado }],
        }
      })

      try {
        await updateLeadEstado(leadId, newEstado)
      } catch {
        // Rollback on error
        setColumns((prev) => {
          const lead = prev[newEstado].find((l) => l.id === leadId)!
          return {
            ...prev,
            [newEstado]: prev[newEstado].filter((l) => l.id !== leadId),
            [currentEstado]: [...prev[currentEstado], { ...lead, estado: currentEstado }],
          }
        })
      }
    },
    [columns]
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveLeadId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLeadId(null)}
    >
      <div className="flex gap-4 pb-4" style={{ overflowX: 'auto', minHeight: 0 }}>
        {COLUMNAS.map((estado) => (
          <KanbanColumn key={estado} estado={estado} leads={columns[estado] ?? []} />
        ))}
      </div>

      <DragOverlay>
        {activeLead && (
          <div
            className="p-3 rounded-lg shadow-2xl"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-accent)',
              width: '260px',
              opacity: 0.95,
              transform: 'rotate(2deg)',
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {activeLead.nombre_lead}
              </span>
              {activeLead.nombre_empresa && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {activeLead.nombre_empresa}
                </span>
              )}
              <TipoBadge tipo={activeLead.tipo_lead} size="sm" />
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
