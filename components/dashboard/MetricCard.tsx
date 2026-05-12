'use client'

import { Users, TrendingUp, Calendar } from 'lucide-react'
import type { MetricasDashboard } from '@/lib/types'

interface SingleCardProps {
  label: string
  value: number | string
  accentColor?: string
  valueColor?: string
  iconName: 'Users' | 'TrendingUp' | 'Calendar'
}

const ICONS = { Users, TrendingUp, Calendar }

function MetricCard({ label, value, accentColor = 'var(--accent-violet)', valueColor, iconName }: SingleCardProps) {
  const Icon = ICONS[iconName]
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-lg transition-all duration-200 cursor-default"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
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
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: `${accentColor}18` }}
        >
          <Icon size={16} style={{ color: accentColor }} />
        </div>
      </div>
      <div
        className="text-3xl font-bold tracking-tight"
        style={{
          color: valueColor ?? 'var(--text-primary)',
          fontFamily: 'var(--font-geist-mono)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

interface MetricCardsProps {
  metricas: MetricasDashboard
}

export function MetricCards({ metricas }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricCard
        label="Total Leads"
        value={metricas.total}
        iconName="Users"
        accentColor="var(--accent-violet)"
      />
      <MetricCard
        label="Ultra Hot"
        value={metricas.ultraHot}
        iconName="Users"
        accentColor="var(--ultra-hot)"
        valueColor="var(--ultra-hot)"
      />
      <MetricCard
        label="Reuniones Hoy"
        value={metricas.reunionesHoy}
        iconName="Calendar"
        accentColor="var(--success)"
      />
      <MetricCard
        label="Cerrados Este Mes"
        value={metricas.cerradosEsteMes}
        iconName="TrendingUp"
        accentColor="var(--success)"
        valueColor="var(--success)"
      />
    </div>
  )
}

export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 p-5 rounded-lg animate-pulse"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 rounded" style={{ background: 'var(--bg-hover)' }} />
            <div className="w-8 h-8 rounded-md" style={{ background: 'var(--bg-hover)' }} />
          </div>
          <div className="h-9 w-16 rounded" style={{ background: 'var(--bg-hover)' }} />
        </div>
      ))}
    </div>
  )
}
