'use client'

import { useState } from 'react'
import { X, Phone, Mail, Globe, ExternalLink, Check, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Lead, EstadoLead } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { updateLeadEstado, updateLeadProximoSeguimiento } from '@/lib/queries'

const ESTADOS: EstadoLead[] = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada',
  'Propuesta Enviada', 'Cerrado Ganado', 'Cerrado Perdido', 'Descalificado',
]

interface LeadDetailProps {
  lead: Lead
  onClose: () => void
  onUpdated: (lead: Lead) => void
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function FlagRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="w-5 h-5 rounded flex items-center justify-center"
        style={{
          background: value ? 'var(--success-soft)' : 'var(--bg-hover)',
        }}
      >
        {value && <Check size={12} style={{ color: 'var(--success)' }} />}
      </span>
    </div>
  )
}

export function LeadDetail({ lead, onClose, onUpdated }: LeadDetailProps) {
  const [estado, setEstado] = useState<EstadoLead>(lead.estado)
  const needsTime = lead.tipo_lead === 'Ultra Hot' || lead.tipo_lead === 'Hot'
  const [proximoSeguimiento, setProximoSeguimiento] = useState(
    lead.proximo_seguimiento
      ? format(new Date(lead.proximo_seguimiento), needsTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd')
      : ''
  )
  const [saving, setSaving] = useState(false)

  async function handleEstadoChange(newEstado: EstadoLead) {
    setEstado(newEstado)
    setSaving(true)
    try {
      await updateLeadEstado(lead.id, newEstado)
      onUpdated({ ...lead, estado: newEstado })
    } catch {
      setEstado(lead.estado)
    } finally {
      setSaving(false)
    }
  }

  async function handleSeguimientoChange(value: string) {
    setProximoSeguimiento(value)
    setSaving(true)
    try {
      await updateLeadProximoSeguimiento(lead.id, value ? new Date(value).toISOString() : null)
      onUpdated({ ...lead, proximo_seguimiento: value ? new Date(value).toISOString() : null })
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col shadow-2xl"
      style={{
        width: '480px',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-4 p-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TipoBadge tipo={lead.tipo_lead} />
            <span
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-geist-mono)',
                fontSize: '11px',
              }}
            >
              {lead.lead_id}
            </span>
          </div>
          <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {lead.nombre_lead}
          </h2>
          {lead.nombre_empresa && (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {lead.nombre_empresa}
            </span>
          )}
          {lead.puntuacion_lead !== null && (
            <span
              className="text-2xl font-bold"
              style={{
                fontFamily: 'var(--font-geist-mono)',
                color:
                  lead.puntuacion_lead >= 25
                    ? 'var(--ultra-hot)'
                    : lead.puntuacion_lead >= 18
                    ? 'var(--hot)'
                    : lead.puntuacion_lead >= 12
                    ? 'var(--warm)'
                    : 'var(--cold)',
              }}
            >
              {lead.puntuacion_lead} pts
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-md transition-all duration-150 shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Contacto */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Contacto
          </h3>
          <div className="flex flex-col gap-2">
            {lead.whatsapp && (
              <a
                href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm transition-all duration-150"
                style={{ color: 'var(--success)' }}
              >
                <Phone size={14} />
                {lead.whatsapp}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-2 text-sm"
                style={{ color: 'var(--cold)' }}
              >
                <Mail size={14} />
                {lead.email}
              </a>
            )}
            {lead.link_pagina_web && (
              <a
                href={lead.link_pagina_web}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm"
                style={{ color: 'var(--accent-violet)' }}
              >
                <Globe size={14} />
                {lead.link_pagina_web}
              </a>
            )}
          </div>
        </section>

        {/* Calificación */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Calificación
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Industria" value={lead.industria_empresa} />
            <InfoRow label="Rol" value={lead.rol_lead} />
            <InfoRow label="Leads mensuales" value={lead.leads_mensuales} />
            <InfoRow label="Inversión publicidad" value={lead.inversion_publicidad} />
            <InfoRow label="Presupuesto" value={lead.presupuesto_asignado} />
            <InfoRow label="Urgencia" value={lead.urgencia} />
            <InfoRow label="Facturación mensual" value={lead.facturacion_mensual} />
            <InfoRow label="Sistema de cierre" value={lead.sistema_cierre_leads} />
            <InfoRow label="Fuente" value={lead.fuente} />
            <InfoRow label="Awareness" value={lead.awareness} />
          </div>
          {lead.mayor_desafio_hoy && lead.mayor_desafio_hoy.length > 0 && (
            <div className="mt-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Mayores desafíos</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {lead.mayor_desafio_hoy.map((d) => (
                  <span
                    key={d}
                    className="text-xs px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          {lead.comentario_problematica && (
            <div className="mt-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Problemática</span>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {lead.comentario_problematica}
              </p>
            </div>
          )}
        </section>

        {/* Research Insight */}
        {lead.research_insight && (
          <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Research Insight
            </h3>
            <div
              className="p-3 rounded-md text-sm"
              style={{
                background: 'var(--accent-violet-soft)',
                border: '1px solid var(--border-accent)',
                color: 'var(--text-secondary)',
              }}
            >
              {lead.research_insight}
            </div>
          </section>
        )}

        {/* Estado Pipeline */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Estado Pipeline {saving && <span style={{ color: 'var(--accent-violet)' }}>· guardando</span>}
          </h3>
          <select
            value={estado}
            onChange={(e) => handleEstadoChange(e.target.value as EstadoLead)}
            className="w-full text-sm px-3 py-2 rounded-md outline-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </section>

        {/* Próximo seguimiento */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Próximo Seguimiento
            {needsTime && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--accent-violet)' }}>
                · con hora
              </span>
            )}
          </h3>
          <input
            type={needsTime ? 'datetime-local' : 'date'}
            value={proximoSeguimiento}
            onChange={(e) => handleSeguimientoChange(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md outline-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </section>

        {/* Flags de automatización */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Automatización
          </h3>
          <FlagRow label="Primer correo enviado" value={lead.primer_correo_enviado} />
          <FlagRow label="Primer WhatsApp enviado" value={lead.primer_contacto_whatsapp_enviado} />
          <FlagRow label="Segundo WhatsApp enviado" value={lead.segundo_whatsapp_enviado} />
          <FlagRow label="Reunión Calendly agendada" value={lead.reunion_calendly_agendada} />
          <FlagRow label="Entró en nurturing" value={lead.entro_nurturing} />
          {lead.intento_contacto_primer_mensaje_whatsapp > 0 && (
            <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Intentos WA: {lead.intento_contacto_primer_mensaje_whatsapp}
            </div>
          )}
          {lead.warm_email_step > 0 && (
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Email step nurturing: {lead.warm_email_step}
            </div>
          )}
        </section>

        {/* WhatsApp */}
        {(lead.resumen_whatsapp || lead.respuesta_whatsapp || lead.respuesta_objecion_agendamiento) && (
          <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              WhatsApp
            </h3>
            <div className="flex flex-col gap-3">
              {lead.resumen_whatsapp && (
                <div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Resumen WhatsApp</span>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{lead.resumen_whatsapp}</p>
                </div>
              )}
              {lead.respuesta_whatsapp && (
                <div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Respuesta WhatsApp</span>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{lead.respuesta_whatsapp}</p>
                </div>
              )}
              {lead.respuesta_objecion_agendamiento && (
                <div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Respuesta objeción agendamiento</span>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{lead.respuesta_objecion_agendamiento}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Links Chatwoot */}
        {(lead.conversacion_chatwoot_id || lead.contacto_chatwoot_id) && (
          <section className="p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Links rápidos
            </h3>
            {lead.conversacion_chatwoot_id && (
              <a
                href={`#chatwoot-conv-${lead.conversacion_chatwoot_id}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md"
                style={{
                  background: 'var(--accent-violet-soft)',
                  color: 'var(--accent-violet)',
                }}
              >
                <MessageSquare size={14} />
                Ver en Chatwoot
                <ExternalLink size={12} />
              </a>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
