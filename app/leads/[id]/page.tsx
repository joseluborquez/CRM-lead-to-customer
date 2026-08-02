'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Phone, Mail, Globe, Check, Trash2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Lead, EstadoLead } from '@/lib/types'
import { getLeadById, updateLeadEstado, updateLeadProximoSeguimiento, updateLeadMontoCerrado, deleteLead } from '@/lib/queries'
import { TipoBadge } from '@/components/ui/TipoBadge'
import { TopBar } from '@/components/layout/TopBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { colorDeScore } from '@/lib/utils'

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

function FlagRow({ label, value }: { label: string; value: boolean | null }) {
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
  const [montoCerrado, setMontoCerrado] = useState('')

  useEffect(() => {
    getLeadById(id)
      .then((data) => {
        if (data) {
          setLead(data)
          setEstado(data.estado)
          setMontoCerrado(data.monto_cerrado?.toString() ?? '')
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
      const esCerrado = newEstado === 'Cerrado Ganado' || newEstado === 'Cerrado Perdido'
      await updateLeadEstado(id, newEstado)
      setLead((prev) => prev ? { ...prev, estado: newEstado, fecha_cierre: esCerrado ? new Date().toISOString() : null } : prev)
    } catch {
      if (lead) setEstado(lead.estado)
    } finally {
      setSaving(false)
    }
  }

  async function handleMontoCerradoBlur() {
    const monto = montoCerrado === '' ? null : Number(montoCerrado)
    if (monto !== null && (Number.isNaN(monto) || monto < 0)) return
    setSaving(true)
    try {
      await updateLeadMontoCerrado(id, monto)
      setLead((prev) => prev ? { ...prev, monto_cerrado: monto } : prev)
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

  const scoreColor = colorDeScore(lead.puntuacion_lead)

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
              <div
                className="grid grid-cols-2 gap-3 mt-4 pt-4"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <InfoRow label="Industria" value={lead.industria_empresa} />
                <InfoRow label="Canal" value={lead.canal_adquisicion} />
                <InfoRow label="Fuente" value={lead.fuente} />
              </div>
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

              {estado === 'Cerrado Ganado' && (
                <div className="mb-4">
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
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--success)',
                      fontFamily: 'var(--font-geist-mono)',
                    }}
                  />
                </div>
              )}

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
            </div>

            {/* Estado de la calificación */}
            <div
              className="p-5 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Calificación del agente
              </h3>
              <FlagRow label="Calificación completa" value={lead.calificacion_completa} />
              <FlagRow label="Reunión agendada" value={lead.fecha_reunion !== null} />
            </div>
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
