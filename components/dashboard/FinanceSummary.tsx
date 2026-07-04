'use client'

import { DollarSign, TrendingUp, Percent, Receipt } from 'lucide-react'
import type { MetricasFinancieras } from '@/lib/types'

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

interface FinanceCardProps {
  label: string
  value: string
  accentColor: string
  icon: React.ReactNode
}

function FinanceCard({ label, value, accentColor, icon }: FinanceCardProps) {
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-lg transition-all duration-200 cursor-default"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
        e.currentTarget.style.borderColor = 'var(--border-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-card)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: `${accentColor}18` }}
        >
          {icon}
        </div>
      </div>
      <div
        className="text-3xl font-bold tracking-tight"
        style={{ color: accentColor, fontFamily: 'var(--font-geist-mono)' }}
      >
        {value}
      </div>
    </div>
  )
}

interface FinanceSummaryProps {
  metricas: MetricasFinancieras
}

export function FinanceSummary({ metricas }: FinanceSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Resumen Financiero
      </h2>
      <div className="grid grid-cols-4 gap-4">
        <FinanceCard
          label="Ingresos Este Mes"
          value={formatUSD(metricas.ingresosEsteMes)}
          accentColor="var(--success)"
          icon={<DollarSign size={16} style={{ color: 'var(--success)' }} />}
        />
        <FinanceCard
          label="Ingresos Totales"
          value={formatUSD(metricas.ingresosTotales)}
          accentColor="var(--accent-violet)"
          icon={<TrendingUp size={16} style={{ color: 'var(--accent-violet)' }} />}
        />
        <FinanceCard
          label="Ticket Promedio"
          value={formatUSD(metricas.ticketPromedio)}
          accentColor="var(--cold)"
          icon={<Receipt size={16} style={{ color: 'var(--cold)' }} />}
        />
        <FinanceCard
          label="Tasa de Conversión"
          value={`${Math.round(metricas.tasaConversion * 100)}%`}
          accentColor="var(--warm)"
          icon={<Percent size={16} style={{ color: 'var(--warm)' }} />}
        />
      </div>
      <div
        className="flex items-center gap-6 px-5 py-3 rounded-lg"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Ganados: <strong style={{ color: 'var(--success)' }}>{metricas.dealsGanados}</strong>
        </span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Perdidos: <strong style={{ color: 'var(--ultra-hot)' }}>{metricas.dealsPerdidos}</strong>
        </span>
      </div>
    </div>
  )
}

export function FinanceSummarySkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-4 w-40 rounded" style={{ background: 'var(--bg-hover)' }} />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 p-5 rounded-lg"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 rounded" style={{ background: 'var(--bg-hover)' }} />
              <div className="w-8 h-8 rounded-md" style={{ background: 'var(--bg-hover)' }} />
            </div>
            <div className="h-9 w-20 rounded" style={{ background: 'var(--bg-hover)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
