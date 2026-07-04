'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Mail, Globe, Check, ExternalLink, MessageSquare, Trash2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Lead, EstadoLead } from '@/lib/types'
import { getLeadById, updateLeadEstado, updateLeadProximoSeguimiento, deleteLead } from '@/lib/queries'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { TopBar } from '@/components/layout/TopBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const ESTADOS: EstadoLead[] = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada',
  'Propuesta Enviada', 'Cerrado Ganado', 'Cerrado Perdido', 'Descalificado',
]

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-md" style={{ background: 'var(--bg-hover)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function FlagRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="w-5 h-5 rounded flex items-center justify-center"
        style={{ background: value ? 'var(--success-soft)' : 'var(--bg-hover)' }}
      >
        {value && <Check size={12} style={{ color: 'var(--success)' }} />}
      </span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      <div className="h-8 w-64 rounded" style={{ background: 'var(--bg-card)' }} />
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-4">
          <div className="h-48 rounded-lg" style={{ background: 'var(--bg-card)' }} />
          <div className="h-64 rounded-lg" style={{ background: 'var(--bg-card)' }} />
        </div>
        <div className="h-96 rounded-lg" style={{ background: 'var(--bg-card)' }} />
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [estado, setEstado] = useState<EstadoLead>('Nuevo')
  const [proximoSeguimiento, setProximoSeguimiento] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getLeadById(id)
      .then((data) => {
        if (data) {
          setLead(data)
          setEstado(data.estado)
          const needsTime = data.tipo_lead === 'Ultra Hot' || data.tipo_lead === 'Hot'
          setProximoSeguimiento(
            data.proximo_seguimiento
              ? format(new Date(data.proximo_seguimiento), needsTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd')
              : ''
          )
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  async function handleEstadoChange(newEstado: EstadoLead) {
    setEstado(newEstado)
    setSaving(true)
    try {
      await updateLeadEstado(id, newEstado)
      setLead((prev) => prev ? { ...prev, estado: newEstado } : prev)
    } catch {
      if (lead) setEstado(lead.estado)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteLead(id)
      router.push('/leads')
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleSeguimientoChange(value: string) {
    setProximoSeguimiento(value)
    setSaving(true)
    try {
      const iso = value ? new Date(value).toISOString() : null
      await updateLeadProximoSeguimiento(id, iso)
      setLead((prev) => prev ? { ...prev, proximo_seguimiento: iso } : prev)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton />
  if (!lead) {
    return (
      <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
        Lead no encontrado
      </div>
    )
  }

  const needsTime = lead.tipo_lead === 'Ultra Hot' || lead.tipo_lead === 'Hot'

  const scoreColor =
    (lead.puntuacion_lead ?? 0) >= 25 ? 'var(--ultra-hot)'
    : (lead.puntuacion_lead ?? 0) >= 18 ? 'var(--hot)'
    : (lead.puntuacion_lead ?? 0) >= 12 ? 'var(--warm)'
    : 'var(--cold)'

  return (
    <div className="flex flex-col min-h-full">
      <TopBar titulo={lead.nombre_lead} />

      <div className="p-6">
        {/* Back + Delete */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm transition-all duration-150"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <ArrowLeft size={16} />
            Volver a Leads
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all duration-150"
            style={{ color: 'var(--ultra-hot)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ultra-hot-soft)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <Trash2 size={14} />
            Eliminar lead
          </button>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 340px' }}>
          {/* Main */}
          <div className="flex flex-col gap-6">
            {/* Header card */}
            <div
              className="p-6 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
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
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {lead.nombre_lead}
                  </h1>
                  {lead.nombre_empresa && (
                    <span className="text-base" style={{ color: 'var(--text-secondary)' }}>
                      {lead.nombre_empresa}
                    </span>
                  )}
                </div>
                {lead.puntuacion_lead !== null && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Score</span>
                    <span
                      className="text-4xl font-black"
                      style={{ color: scoreColor, fontFamily: 'var(--font-geist-mono)' }}
                    >
                      {lead.puntuacion_lead}
                    </span>
                  </div>
                )}
              </div>

              {/* Contacto */}
              <div className="flex flex-wrap gap-4 mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                {lead.whatsapp && (
                  <a
                    href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm"
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
            </div>

            {/* Calificación */}
            <div
              className="p-6 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                Calificación
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Industria" value={lead.industria_empresa} />
                <InfoRow label="Rol" value={lead.rol_lead} />
                <InfoRow label="Leads mensuales" value={lead.leads_mensuales} />
                <InfoRow label="Inversión publicidad" value={lead.inversion_publicidad} />
                <InfoRow label="Presupuesto asignado" value={lead.presupuesto_asignado} />
                <InfoRow label="Urgencia" value={lead.urgencia} />
                <InfoRow label="Facturación mensual" value={lead.facturacion_mensual} />
                <InfoRow label="Sistema de cierre" value={lead.sistema_cierre_leads} />
                <InfoRow label="Fuente" value={lead.fuente} />
                <InfoRow label="Awareness" value={lead.awareness} />
              </div>
              {lead.mayor_desafio_hoy && lead.mayor_desafio_hoy.length > 0 && (
                <div className="mt-4">
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
                <div className="mt-4 p-3 rounded-md" style={{ background: 'var(--bg-hover)' }}>
                  <span className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Problemática</span>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {lead.comentario_problematica}
                  </p>
                </div>
              )}
            </div>

            {/* Research Insight */}
            {lead.research_insight && (
              <div
                className="p-6 rounded-lg"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Research Insight
                </h2>
                <div
                  className="p-4 rounded-md text-sm"
                  style={{
                    background: 'var(--accent-violet-soft)',
                    border: '1px solid var(--border-accent)',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  {lead.research_insight}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Pipeline + Seguimiento */}
            <div
              className="p-5 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Estado Pipeline {saving && <span style={{ color: 'var(--accent-violet)' }}>· guardando</span>}
              </h3>
              <select
                value={estado}
                onChange={(e) => handleEstadoChange(e.target.value as EstadoLead)}
                className="w-full text-sm px-3 py-2 rounded-md outline-none mb-4"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>

              <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
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
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Fechas */}
            <div
              className="p-5 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Fechas
              </h3>
              {lead.fecha_captura && (
                <div className="flex flex-col gap-0.5 mb-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Capturado</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {format(new Date(lead.fecha_captura), "d MMM yyyy", { locale: es })}
                    {' · '}
                    {formatDistanceToNow(new Date(lead.fecha_captura), { addSuffix: true, locale: es })}
                  </span>
                </div>
              )}
              {lead.ultimo_contacto && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Último contacto</span>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {format(new Date(lead.ultimo_contacto), "d MMM yyyy", { locale: es })}
                  </span>
                </div>
              )}
            </div>

            {/* Automatización */}
            <div
              className="p-5 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Automatización
              </h3>
              <FlagRow label="Primer correo enviado" value={lead.primer_correo_enviado} />
              <FlagRow label="Primer WhatsApp enviado" value={lead.primer_contacto_whatsapp_enviado} />
              <FlagRow label="Reunión Calendly agendada" value={lead.reunion_calendly_agendada} />
              <FlagRow label="Entró en nurturing" value={lead.entro_nurturing} />
              {lead.intento_contacto_primer_mensaje_whatsapp > 0 && (
                <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Intentos WA: {lead.intento_contacto_primer_mensaje_whatsapp}
                </div>
              )}
              {lead.warm_email_step > 0 && (
                <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Email step: {lead.warm_email_step}
                </div>
              )}
            </div>

            {/* Links Chatwoot */}
            {lead.conversacion_chatwoot_id && (
              <div
                className="p-5 rounded-lg"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                  Links rápidos
                </h3>
                <a
                  href={`#chatwoot-conv-${lead.conversacion_chatwoot_id}`}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-md"
                  style={{
                    background: 'var(--accent-violet-soft)',
                    color: 'var(--accent-violet)',
                  }}
                >
                  <MessageSquare size={14} />
                  Ver en Chatwoot
                  <ExternalLink size={12} className="ml-auto" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar lead"
        message={`¿Seguro que quieres eliminar a "${lead.nombre_lead}"? Esta acción no se puede deshacer.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
