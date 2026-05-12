'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { MetricasDashboard } from '@/lib/types'

interface LeadsByTypeProps {
  metricas: MetricasDashboard
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; payload: { fill: string } }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="px-3 py-2 rounded-md text-sm"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-accent)',
        color: 'var(--text-primary)',
      }}
    >
      <p className="font-medium">{label}</p>
      <p style={{ color: payload[0].payload.fill }}>{payload[0].value} leads</p>
    </div>
  )
}

export function LeadsByType({ metricas }: LeadsByTypeProps) {
  const data = [
    { name: 'Ultra Hot', value: metricas.ultraHot, fill: '#FF4444' },
    { name: 'Hot', value: metricas.hot, fill: '#FF8C00' },
    { name: 'Warm', value: metricas.warm, fill: '#F5C518' },
    { name: 'Cold', value: metricas.cold, fill: '#4488FF' },
  ]

  return (
    <div
      className="p-5 rounded-lg h-full"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
        Leads por Tipo
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.6 }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LeadsByTypeSkeleton() {
  return (
    <div
      className="p-5 rounded-lg h-full animate-pulse"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="h-4 w-32 rounded mb-4" style={{ background: 'var(--bg-hover)' }} />
      <div className="h-56 rounded" style={{ background: 'var(--bg-hover)' }} />
    </div>
  )
}
