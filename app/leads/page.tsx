import { Suspense } from 'react'
import { getLeads, getFollowUpsHoy } from '@/lib/queries'
import { getServerSupabase } from '@/lib/supabase-server'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadFilters } from '@/components/leads/LeadFilters'
import { TopBar } from '@/components/layout/TopBar'
import type { Lead, LeadFiltros } from '@/lib/types'

interface LeadsPageProps {
  searchParams: Promise<{
    tipo?: string
    estado?: string
    industria?: string
    busqueda?: string
    filter?: string
  }>
}

async function LeadsContent({ filtros, filterFollowUp }: { filtros: LeadFiltros; filterFollowUp: boolean }) {
  const db = await getServerSupabase()
  let leads: Lead[]
  if (filterFollowUp) {
    leads = await getFollowUpsHoy(db).catch(() => [])
  } else {
    leads = await getLeads(filtros, db).catch(() => [])
  }
  return <LeadsTable leads={leads} />
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams
  const filterFollowUp = params.filter === 'followup'
  const filtros: LeadFiltros = {
    tipo: params.tipo,
    estado: params.estado,
    industria: params.industria,
    busqueda: params.busqueda,
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar titulo={filterFollowUp ? 'Follow-ups de hoy' : 'Leads'} />
      <div className="flex flex-col gap-4 p-6">
        {!filterFollowUp && (
          <Suspense fallback={null}>
            <LeadFilters />
          </Suspense>
        )}
        <Suspense
          fallback={
            <div
              className="h-64 rounded-lg animate-pulse"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            />
          }
        >
          <LeadsContent filtros={filtros} filterFollowUp={filterFollowUp} />
        </Suspense>
      </div>
    </div>
  )
}
