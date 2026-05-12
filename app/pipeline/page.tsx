import { getLeadsByEstado } from '@/lib/queries'
import { getServerSupabase } from '@/lib/supabase-server'
import { KanbanBoard } from '@/components/pipeline/KanbanBoard'
import { TopBar } from '@/components/layout/TopBar'
import type { EstadoLead } from '@/lib/types'

const EMPTY: Record<EstadoLead, never[]> = {
  Nuevo: [], Contactado: [], 'En Nurturing': [], 'Reunión Agendada': [],
  'Propuesta Enviada': [], 'Cerrado Ganado': [], 'Cerrado Perdido': [], Descalificado: [],
}

export default async function PipelinePage() {
  const db = await getServerSupabase()
  const leadsByEstado = await getLeadsByEstado(db).catch(() => EMPTY)

  return (
    <div className="flex flex-col h-full">
      <TopBar titulo="Pipeline" />
      <div className="flex-1 overflow-x-auto p-6">
        <KanbanBoard initialLeads={leadsByEstado} />
      </div>
    </div>
  )
}
