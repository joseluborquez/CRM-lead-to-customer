import { getMetricasDashboard, getMetricasFinancieras, getFollowUpsHoy, getLeadsRecientes } from '@/lib/queries'
import { getServerSupabase } from '@/lib/supabase-server'
import { MetricCards } from '@/components/dashboard/MetricCard'
import { FinanceSummary } from '@/components/dashboard/FinanceSummary'
import { LeadsByType } from '@/components/dashboard/LeadsByType'
import { FollowUpsHoy } from '@/components/dashboard/FollowUpsHoy'
import { RecentLeads } from '@/components/dashboard/RecentLeads'
import { TopBar } from '@/components/layout/TopBar'

export default async function DashboardPage() {
  const db = await getServerSupabase()

  const [metricas, financieras, followUps, leadsRecientes] = await Promise.all([
    getMetricasDashboard(db).catch(() => ({
      total: 0, ultraHot: 0, hot: 0, warm: 0, cold: 0, reunionesHoy: 0, cerradosEsteMes: 0,
    })),
    getMetricasFinancieras(db).catch(() => ({
      porMoneda: [], dealsGanados: 0, dealsPerdidos: 0, tasaConversion: 0,
    })),
    getFollowUpsHoy(db).catch(() => []),
    getLeadsRecientes(10, db).catch(() => []),
  ])

  return (
    <div className="flex flex-col min-h-full">
      <TopBar titulo="Dashboard" />
      <div className="flex flex-col gap-6 p-6">
        <FinanceSummary metricas={financieras} />
        <MetricCards metricas={metricas} />
        <div className="grid gap-4" style={{ gridTemplateColumns: '60% 1fr' }}>
          <LeadsByType metricas={metricas} />
          <FollowUpsHoy leads={followUps} />
        </div>
        <RecentLeads leads={leadsRecientes} />
      </div>
    </div>
  )
}
