import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { Bell } from 'lucide-react'

interface FollowUpsHoyProps {
  leads: Lead[]
}

export function FollowUpsHoy({ leads }: FollowUpsHoyProps) {
  return (
    <div
      className="p-5 rounded-lg h-full flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Follow-ups Hoy
        </h3>
        {leads.length > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'var(--ultra-hot-soft)', color: 'var(--ultra-hot)' }}
          >
            {leads.length}
          </span>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'var(--bg-hover)' }}
          >
            <Bell size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Sin follow-ups para hoy
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md transition-all duration-150"
              style={{ background: 'var(--bg-surface)' }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {lead.nombre_lead}
                </span>
                {lead.nombre_empresa && (
                  <span
                    className="text-xs truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {lead.nombre_empresa}
                  </span>
                )}
                <TipoBadge tipo={lead.tipo_lead} size="sm" />
              </div>
              <Link
                href={`/leads/${lead.id}`}
                className="shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-all duration-150"
                style={{
                  background: 'var(--accent-violet-soft)',
                  color: 'var(--accent-violet)',
                }}
              >
                Ver
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function FollowUpsHoySkeleton() {
  return (
    <div
      className="p-5 rounded-lg h-full animate-pulse"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="h-4 w-32 rounded mb-4" style={{ background: 'var(--bg-hover)' }} />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-14 rounded-md mb-2" style={{ background: 'var(--bg-hover)' }} />
      ))}
    </div>
  )
}
