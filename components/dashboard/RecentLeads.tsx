'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Lead } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { colorDeScore } from '@/lib/utils'

interface RecentLeadsProps {
  leads: Lead[]
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const color = colorDeScore(score)

  return (
    <span
      className="font-semibold"
      style={{ color, fontFamily: 'var(--font-geist-mono)', fontSize: '13px' }}
    >
      {score}
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-md"
      style={{
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {estado}
    </span>
  )
}

export function RecentLeads({ leads }: RecentLeadsProps) {
  return (
    <div
      className="p-5 rounded-lg"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
        Leads Recientes
      </h3>

      {leads.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          No hay leads registrados
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Lead ID', 'Nombre', 'Empresa', 'Tipo', 'Score', 'Estado', 'Captura', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left pb-3 pr-4"
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="transition-all duration-150"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <td className="py-3 pr-4">
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-geist-mono)',
                        fontSize: '11px',
                      }}
                    >
                      {lead.lead_id}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {lead.nombre_lead}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {lead.nombre_empresa ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <TipoBadge tipo={lead.tipo_lead} size="sm" />
                  </td>
                  <td className="py-3 pr-4">
                    <ScoreBadge score={lead.puntuacion_lead} />
                  </td>
                  <td className="py-3 pr-4">
                    <EstadoBadge estado={lead.estado} />
                  </td>
                  <td className="py-3 pr-4">
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {lead.fecha_captura
                        ? formatDistanceToNow(new Date(lead.fecha_captura), {
                            addSuffix: true,
                            locale: es,
                          })
                        : '—'}
                    </span>
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-xs px-3 py-1.5 rounded-md transition-all duration-150"
                      style={{
                        background: 'var(--accent-violet-soft)',
                        color: 'var(--accent-violet)',
                      }}
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function RecentLeadsSkeleton() {
  return (
    <div
      className="p-5 rounded-lg animate-pulse"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="h-4 w-32 rounded mb-4" style={{ background: 'var(--bg-hover)' }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-10 rounded mb-2" style={{ background: 'var(--bg-hover)' }} />
      ))}
    </div>
  )
}
