'use client'

import { DollarSign, TrendingUp, Percent, Receipt } from 'lucide-react'
import type { MetricasFinancieras, Moneda } from '@/lib/types'

/**
 * Formatea en la moneda real del cierre.
 *
 * Antes todo se mostraba como USD, y los cierres estaban cargados en pesos:
 * $2.485.000 CLP aparecía como si fueran dos millones y medio de dólares.
 */
function formatearMonto(valor: number, moneda: Moneda): string {
  return new Intl.NumberFormat(moneda === 'CLP' ? 'es-CL' : 'en-US', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0,
  }).format(valor)
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
      {/* Una fila por moneda. No se suman entre sí: el total combinado no
          significaría nada sin un tipo de cambio con fecha. */}
      {metricas.porMoneda.map((m) => (
        <div key={m.moneda} className="flex flex-col gap-2">
          {metricas.porMoneda.length > 1 && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-md self-start"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {m.moneda} · {m.cierres} {m.cierres === 1 ? 'cierre' : 'cierres'}
            </span>
          )}
          <div className="grid grid-cols-3 gap-4">
            <FinanceCard
              label="Ingresos Este Mes"
              value={formatearMonto(m.esteMes, m.moneda)}
              accentColor="var(--success)"
              icon={<DollarSign size={16} style={{ color: 'var(--success)' }} />}
            />
            <FinanceCard
              label="Ingresos Totales"
              value={formatearMonto(m.total, m.moneda)}
              accentColor="var(--accent-violet)"
              icon={<TrendingUp size={16} style={{ color: 'var(--accent-violet)' }} />}
            />
            <FinanceCard
              label="Ticket Promedio"
              value={formatearMonto(m.ticketPromedio, m.moneda)}
              accentColor="var(--cold)"
              icon={<Receipt size={16} style={{ color: 'var(--cold)' }} />}
            />
          </div>
        </div>
      ))}

      {metricas.porMoneda.length === 0 && (
        <p className="text-sm px-5 py-4 rounded-lg"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Todavía no hay cierres con monto cargado.
        </p>
      )}
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
        <span className="text-sm ml-auto flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Percent size={13} style={{ color: 'var(--warm)' }} />
          Conversión: <strong style={{ color: 'var(--warm)' }}>
            {Math.round(metricas.tasaConversion * 100)}%
          </strong>
        </span>
      </div>
    </div>
  )
}

export function FinanceSummarySkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-4 w-40 rounded" style={{ background: 'var(--bg-hover)' }} />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
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
