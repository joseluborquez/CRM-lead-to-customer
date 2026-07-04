'use client'

import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Phone, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { Lead } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { LeadDetail } from './LeadDetail'

interface LeadsTableProps {
  leads: Lead[]
}

type SortKey = 'nombre_lead' | 'puntuacion_lead' | 'fecha_captura' | 'proximo_seguimiento'
type SortDir = 'asc' | 'desc'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  let color = 'var(--cold)'
  if (score >= 25) color = 'var(--ultra-hot)'
  else if (score >= 18) color = 'var(--hot)'
  else if (score >= 12) color = 'var(--warm)'

  return (
    <span
      className="font-bold"
      style={{ color, fontFamily: 'var(--font-geist-mono)', fontSize: '13px' }}
    >
      {score}
    </span>
  )
}

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (column !== sortKey) return <ChevronsUpDown size={12} style={{ color: 'var(--text-muted)' }} />
  return sortDir === 'asc'
    ? <ChevronUp size={12} style={{ color: 'var(--accent-violet)' }} />
    : <ChevronDown size={12} style={{ color: 'var(--accent-violet)' }} />
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('puntuacion_lead')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads)

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...localLeads].sort((a, b) => {
    let va: string | number | null = a[sortKey] as string | number | null
    let vb: string | number | null = b[sortKey] as string | number | null

    if (va === null) va = sortDir === 'asc' ? Infinity as unknown as number : -Infinity as unknown as number
    if (vb === null) vb = sortDir === 'asc' ? Infinity as unknown as number : -Infinity as unknown as number

    if (typeof va === 'string' && typeof vb === 'string') {
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    }
    return sortDir === 'asc'
      ? (va as number) - (vb as number)
      : (vb as number) - (va as number)
  })

  function handleLeadUpdated(updated: Lead) {
    setLocalLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    setSelectedLead(updated)
  }

  function handleLeadDeleted(id: string) {
    setLocalLeads((prev) => prev.filter((l) => l.id !== id))
    setSelectedLead(null)
  }

  const headers: { label: string; key?: SortKey }[] = [
    { label: 'Lead ID' },
    { label: 'Nombre', key: 'nombre_lead' },
    { label: 'Empresa' },
    { label: 'WhatsApp' },
    { label: 'Tipo' },
    { label: 'Score', key: 'puntuacion_lead' },
    { label: 'Estado' },
    { label: 'Próx. Seguimiento', key: 'proximo_seguimiento' },
    { label: '' },
  ]

  return (
    <>
      {sorted.length === 0 ? (
        <div
          className="py-16 text-center rounded-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          No se encontraron leads con los filtros seleccionados
        </div>
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {headers.map((h) => (
                    <th
                      key={h.label}
                      className="text-left px-4 py-3"
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: h.key ? 'pointer' : 'default',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => h.key && handleSort(h.key)}
                    >
                      <span className="flex items-center gap-1">
                        {h.label}
                        {h.key && <SortIcon column={h.key} sortKey={sortKey} sortDir={sortDir} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((lead) => (
                  <tr
                    key={lead.id}
                    className="transition-all duration-150 cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => setSelectedLead(lead)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {lead.nombre_lead}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {lead.nombre_empresa ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.whatsapp ? (
                        <a
                          href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-xs"
                          style={{ color: 'var(--success)' }}
                        >
                          <Phone size={12} />
                          {lead.whatsapp}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TipoBadge tipo={lead.tipo_lead} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={lead.puntuacion_lead} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md"
                        style={{
                          background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lead.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.proximo_seguimiento ? (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {format(new Date(lead.proximo_seguimiento), 'd MMM', { locale: es })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedLead(lead) }}
                        className="text-xs px-3 py-1.5 rounded-md transition-all duration-150"
                        style={{
                          background: 'var(--accent-violet-soft)',
                          color: 'var(--accent-violet)',
                        }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail panel overlay */}
      {selectedLead && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelectedLead(null)}
          />
          <LeadDetail
            lead={selectedLead}
            onClose={() => setSelectedLead(null)}
            onUpdated={handleLeadUpdated}
            onDeleted={handleLeadDeleted}
          />
        </>
      )}
    </>
  )
}
