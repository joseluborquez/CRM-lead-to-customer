'use client'

import { useEffect, useState } from 'react'
import { X, Phone, Mail, Globe, ExternalLink, Check, Video, Trash2, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Lead, EstadoLead, Mensaje } from '@/lib/types'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { OrigenBadge } from '@/components/ui/OrigenBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { colorDeScore } from '@/lib/utils'
import {
  updateLeadEstado, updateLeadProximoSeguimiento, updateLeadMontoCerrado,
  deleteLead, getMensajesDeLead, bloquearTelefono, desbloquearTelefono, estaBloqueado,
} from '@/lib/queries'

const ESTADOS: EstadoLead[] = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada',
  'Propuesta Enviada', 'Cerrado Ganado', 'Cerrado Perdido', 'Descalificado',
]

interface LeadDetailProps {
  lead: Lead
  onClose: () => void
  onUpdated: (lead: Lead) => void
  onDeleted: (id: string) => void
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

function FlagRow({ label, value }: { label: string; value: boolean | null }) {
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

export function LeadDetail({ lead, onClose, onUpdated, onDeleted }: LeadDetailProps) {
  const [estado, setEstado] = useState<EstadoLead>(lead.estado)
  const needsTime = lead.tipo_lead === 'Ultra Hot' || lead.tipo_lead === 'Hot'
  const [proximoSeguimiento, setProximoSeguimiento] = useState(
    lead.proximo_seguimiento
      ? format(new Date(lead.proximo_seguimiento), needsTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd')
      : ''
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [montoCerrado, setMontoCerrado] = useState(lead.monto_cerrado?.toString() ?? '')
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [cargandoMensajes, setCargandoMensajes] = useState(true)
  const [bloqueado, setBloqueado] = useState(false)
  const [confirmBloqueo, setConfirmBloqueo] = useState(false)

  useEffect(() => {
    let vigente = true

    async function cargarMensajes() {
      setCargandoMensajes(true)
      try {
        const m = await getMensajesDeLead(lead.id)
        if (vigente) setMensajes(m)
      } catch {
        if (vigente) setMensajes([])
      } finally {
        if (vigente) setCargandoMensajes(false)
      }
    }

    cargarMensajes()
    return () => { vigente = false }
  }, [lead.id])

  useEffect(() => {
    let vigente = true
    async function cargarBloqueo() {
      if (!lead.whatsapp) return
      try {
        const b = await estaBloqueado(lead.whatsapp)
        if (vigente) setBloqueado(b)
      } catch { /* no bloquea la vista */ }
    }
    cargarBloqueo()
    return () => { vigente = false }
  }, [lead.whatsapp])

  async function alternarBloqueo() {
    if (!lead.whatsapp) return
    setSaving(true)
    try {
      if (bloqueado) {
        await desbloquearTelefono(lead.whatsapp)
        setBloqueado(false)
      } else {
        await bloquearTelefono(lead.whatsapp, `Bloqueado desde el CRM · ${lead.nombre_lead}`)
        setBloqueado(true)
      }
      setConfirmBloqueo(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteLead(lead.id)
      onDeleted(lead.id)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleEstadoChange(newEstado: EstadoLead) {
    setEstado(newEstado)
    setSaving(true)
    try {
      const esCerrado = newEstado === 'Cerrado Ganado' || newEstado === 'Cerrado Perdido'
      await updateLeadEstado(lead.id, newEstado)
      onUpdated({ ...lead, estado: newEstado, fecha_cierre: esCerrado ? new Date().toISOString() : null })
    } catch {
      setEstado(lead.estado)
    } finally {
      setSaving(false)
    }
  }

  async function handleMontoCerradoBlur() {
    const monto = montoCerrado === '' ? null : Number(montoCerrado)
    if (monto !== null && (Number.isNaN(monto) || monto < 0)) return
    setSaving(true)
    try {
      await updateLeadMontoCerrado(lead.id, monto)
      onUpdated({ ...lead, monto_cerrado: monto })
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
            <OrigenBadge origen={lead.origen} />
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
                color: colorDeScore(lead.puntuacion_lead),
              }}
            >
              {lead.puntuacion_lead} pts
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {lead.whatsapp && (
            <button
              onClick={() => (bloqueado ? alternarBloqueo() : setConfirmBloqueo(true))}
              className="p-2 rounded-md transition-all duration-150"
              style={{ color: bloqueado ? 'var(--ultra-hot)' : 'var(--text-muted)' }}
              title={bloqueado ? 'Número bloqueado — clic para desbloquear' : 'Bloquear número'}
            >
              <Ban size={18} />
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 rounded-md transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ultra-hot-soft)'; e.currentTarget.style.color = 'var(--ultra-hot)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            title="Eliminar lead"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-md transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {bloqueado && (
        <div
          className="px-5 py-2.5 text-sm flex items-center gap-2"
          style={{ background: 'var(--ultra-hot-soft)', color: 'var(--ultra-hot)' }}
        >
          <Ban size={14} />
          Número bloqueado. El agente no le responde.
        </div>
      )}

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
          {/* Dimensiones que puntúan, en orden de peso */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Alcance (7 pts)" value={lead.alcance_proyecto} />
            <InfoRow label="Dolor (6 pts)" value={lead.especificidad_dolor} />
            <InfoRow label="Presupuesto (5 pts)" value={lead.presupuesto_asignado} />
            <InfoRow label="Rol (4 pts)" value={lead.rol_lead} />
            <InfoRow label="Urgencia (4 pts)" value={lead.urgencia} />
            <InfoRow label="Sistemas (4 pts)" value={lead.madurez_sistemas} />
            <InfoRow label="Equipo (3 pts)" value={lead.tamano_equipo} />
          </div>

          {/* Contexto: no puntúa */}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <InfoRow label="Industria" value={lead.industria_empresa} />
            <InfoRow label="Canal" value={lead.canal_adquisicion} />
            <InfoRow label="Fuente" value={lead.fuente} />
          </div>

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

          {estado === 'Cerrado Ganado' && (
            <div className="mt-3">
              <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Monto cerrado (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={montoCerrado}
                onChange={(e) => setMontoCerrado(e.target.value)}
                onBlur={handleMontoCerradoBlur}
                placeholder="0.00"
                className="w-full text-sm px-3 py-2 rounded-md outline-none mt-1"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--success)',
                  fontFamily: 'var(--font-geist-mono)',
                }}
              />
            </div>
          )}
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

        {/* Estado de la calificación */}
        <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Calificación del agente
          </h3>
          <FlagRow label="Calificación completa" value={lead.calificacion_completa} />
          <FlagRow label="Reunión agendada" value={lead.fecha_reunion !== null} />
        </section>

        {/* Señales que el agente capturó de la conversación */}
        {lead.senales_conversacion != null &&
          typeof lead.senales_conversacion === 'object' &&
          !Array.isArray(lead.senales_conversacion) &&
          Object.keys(lead.senales_conversacion).length > 0 && (
          <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Señales de la conversación
            </h3>
            <div className="flex flex-col gap-2">
              {Object.entries(lead.senales_conversacion).map(([clave, valor]) => (
                <InfoRow
                  key={clave}
                  label={clave.replace(/_/g, ' ')}
                  value={typeof valor === 'string' ? valor : JSON.stringify(valor)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Reunión */}
        {(lead.fecha_reunion || lead.link_reunion) && (
          <section className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Reunión
            </h3>
            <div className="flex flex-col gap-3">
              {lead.fecha_reunion && (
                <InfoRow
                  label="Fecha y hora"
                  value={format(new Date(lead.fecha_reunion), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
                />
              )}
              {lead.estado_reunion && <InfoRow label="Estado" value={lead.estado_reunion} />}
              {lead.link_reunion && (
                <a
                  href={lead.link_reunion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md self-start"
                  style={{ background: 'var(--accent-violet-soft)', color: 'var(--accent-violet)' }}
                >
                  <Video size={14} />
                  Unirse a la videollamada
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </section>
        )}

        {/* Transcripción de la conversación de WhatsApp */}
        <section className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Conversación
            {mensajes.length > 0 && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--text-muted)' }}>
                · {mensajes.length} mensajes
              </span>
            )}
          </h3>

          {cargandoMensajes ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          ) : mensajes.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Sin conversación registrada.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {mensajes.map((m) => {
                const esLead = m.rol === 'lead'
                return (
                  <div
                    key={m.id}
                    className="rounded-md px-3 py-2 max-w-[85%]"
                    style={{
                      alignSelf: esLead ? 'flex-start' : 'flex-end',
                      background: esLead ? 'var(--bg-hover)' : 'var(--success-soft)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium" style={{ color: esLead ? 'var(--text-secondary)' : 'var(--success)' }}>
                        {esLead ? (lead.nombre_lead || 'Lead') : m.rol === 'agente' ? 'Agente' : m.rol === 'humano' ? 'Tú' : 'Sistema'}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {format(new Date(m.enviado_en), 'd MMM HH:mm', { locale: es })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                      {m.tipo_mensaje === 'texto' ? m.contenido : `[${m.tipo_mensaje}] ${m.contenido}`.trim()}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmBloqueo}
        title="Bloquear número"
        message={`El agente dejará de responderle a ${lead.whatsapp}, sin siquiera saludar. El lead queda en el CRM y podés desbloquearlo cuando quieras.`}
        loading={saving}
        onConfirm={alternarBloqueo}
        onCancel={() => setConfirmBloqueo(false)}
      />

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
