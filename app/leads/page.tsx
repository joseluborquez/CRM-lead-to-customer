import { Suspense } from 'react'
import { getLeads } from '@/lib/queries'
import { getServerSupabase } from '@/lib/supabase-server'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { TopBar } from '@/components/layout/TopBar'
import type { LeadFiltros } from '@/lib/types'

interface LeadsPageProps {
  searchParams: Promise<{
    tipo?: string
    estado?: string
    industria?: string
    busqueda?: string
  }>
}

async function LeadsContent({ filtros }: { filtros: LeadFiltros }) {
  const db = await getServerSupabase()
  const leads = await getLeads(filtros, db).catch(() => [])
  return <LeadsTable leads={leads} />
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams
  const filtros: LeadFiltros = {
    tipo: params.tipo,
    estado: params.estado,
    industria: params.industria,
    busqueda: params.busqueda,
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar titulo="Leads" />
      <div className="flex flex-col gap-4 p-6">
        <Suspense fallback={null}>
          <LeadFilters />
        </Suspense>
        <Suspense
          fallback={
            <div
              className="h-64 rounded-lg animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            />
          }
        >
          <LeadsContent filtros={filtros} />
        </Suspense>
      </div>
    </div>
  )
}
