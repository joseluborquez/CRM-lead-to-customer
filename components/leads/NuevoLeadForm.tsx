'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Lead, EstadoLead } from '@/lib/types'
import {
  ALCANCES_PROYECTO, ESPECIFICIDADES_DOLOR, PRESUPUESTOS, ROLES, URGENCIAS,
  MADUREZ_SISTEMAS, TAMANOS_EQUIPO, INDUSTRIAS, FUENTES, CANALES_ADQUISICION,
} from '@/lib/types'
import { crearLead, type NuevoLead } from '@/lib/queries'

const ESTADOS: EstadoLead[] = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada',
  'Propuesta Enviada', 'Cerrado Ganado', 'Cerrado Perdido', 'Descalificado',
]

const entrada = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
        {hint && <span className="ml-1" style={{ color: 'var(--accent-violet)' }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Select({
  value, onChange, opciones, placeholder = '—',
}: {
  value: string
  onChange: (v: string) => void
  opciones: readonly string[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm px-3 py-2 rounded-md outline-none"
      style={entrada}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Texto({
  value, onChange, placeholder, type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm px-3 py-2 rounded-md outline-none"
      style={entrada}
    />
  )
}

interface Props {
  onCreado: (lead: Lead) => void
  onCerrar: () => void
}

export function NuevoLeadForm({ onCreado, onCerrar }: Props) {
  const [campos, setCampos] = useState<Record<string, string>>({ estado: 'Nuevo' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (v: string) => setCampos((p) => ({ ...p, [k]: v }))
  const esCerrado = campos.estado === 'Cerrado Ganado' || campos.estado === 'Cerrado Perdido'

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!campos.nombre_lead?.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      // Los vacíos se omiten para que queden NULL y no como cadena vacía,
      // que rompería los CHECK de Postgres.
      const payload = Object.fromEntries(
        Object.entries(campos).filter(([, v]) => v !== '' && v != null)
      ) as unknown as NuevoLead

      const lead = await crearLead({
        ...payload,
        monto_cerrado: campos.monto_cerrado ? Number(campos.monto_cerrado) : null,
        fecha_cierre: campos.fecha_cierre ? new Date(campos.fecha_cierre).toISOString() : null,
      })
      onCreado(lead)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el lead.')
      setGuardando(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onCerrar}
      />
      <form
        onSubmit={guardar}
        className="fixed inset-y-0 right-0 z-50 flex flex-col shadow-2xl"
        style={{ width: '520px', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Nuevo lead
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              El puntaje se calcula solo al guardar
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-2 rounded-md"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="p-5 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Contacto
            </h3>
            <Campo label="Nombre *">
              <Texto value={campos.nombre_lead ?? ''} onChange={set('nombre_lead')} placeholder="Nombre de la persona" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Empresa">
                <Texto value={campos.nombre_empresa ?? ''} onChange={set('nombre_empresa')} />
              </Campo>
              <Campo label="WhatsApp">
                <Texto value={campos.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="+56 9 ..." />
              </Campo>
              <Campo label="Email">
                <Texto type="email" value={campos.email ?? ''} onChange={set('email')} />
              </Campo>
              <Campo label="Sitio web">
                <Texto value={campos.link_pagina_web ?? ''} onChange={set('link_pagina_web')} />
              </Campo>
            </div>
          </section>

          <section className="p-5 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Calificación
            </h3>
            <Campo label="Alcance del proyecto" hint="7 pts">
              <Select value={campos.alcance_proyecto ?? ''} onChange={set('alcance_proyecto')} opciones={ALCANCES_PROYECTO} />
            </Campo>
            <Campo label="Especificidad del dolor" hint="6 pts">
              <Select value={campos.especificidad_dolor ?? ''} onChange={set('especificidad_dolor')} opciones={ESPECIFICIDADES_DOLOR} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Presupuesto" hint="5 pts">
                <Select value={campos.presupuesto_asignado ?? ''} onChange={set('presupuesto_asignado')} opciones={PRESUPUESTOS} />
              </Campo>
              <Campo label="Rol" hint="4 pts">
                <Select value={campos.rol_lead ?? ''} onChange={set('rol_lead')} opciones={ROLES} />
              </Campo>
              <Campo label="Urgencia" hint="4 pts">
                <Select value={campos.urgencia ?? ''} onChange={set('urgencia')} opciones={URGENCIAS} />
              </Campo>
              <Campo label="Sistemas" hint="4 pts">
                <Select value={campos.madurez_sistemas ?? ''} onChange={set('madurez_sistemas')} opciones={MADUREZ_SISTEMAS} />
              </Campo>
              <Campo label="Equipo" hint="3 pts">
                <Select value={campos.tamano_equipo ?? ''} onChange={set('tamano_equipo')} opciones={TAMANOS_EQUIPO} />
              </Campo>
            </div>
            <Campo label="Problemática">
              <textarea
                value={campos.comentario_problematica ?? ''}
                onChange={(e) => set('comentario_problematica')(e.target.value)}
                rows={3}
                placeholder="Qué proceso le duele, en sus palabras"
                className="w-full text-sm px-3 py-2 rounded-md outline-none resize-y"
                style={entrada}
              />
            </Campo>
          </section>

          <section className="p-5 flex flex-col gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Contexto
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Industria">
                <Select value={campos.industria_empresa ?? ''} onChange={set('industria_empresa')} opciones={INDUSTRIAS} />
              </Campo>
              <Campo label="Canal">
                <Select value={campos.canal_adquisicion ?? ''} onChange={set('canal_adquisicion')} opciones={CANALES_ADQUISICION} />
              </Campo>
              <Campo label="Fuente">
                <Select value={campos.fuente ?? ''} onChange={set('fuente')} opciones={FUENTES} />
              </Campo>
            </div>
          </section>

          <section className="p-5 flex flex-col gap-3">
            <h3 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Estado
            </h3>
            <Campo label="Estado en el pipeline">
              <Select value={campos.estado ?? 'Nuevo'} onChange={set('estado')} opciones={ESTADOS} placeholder="Nuevo" />
            </Campo>

            {/* Cargar clientes ya cerrados: sin monto, las métricas financieras
                los cuentan como $0. */}
            {esCerrado && (
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Monto cerrado (USD)">
                  <Texto type="number" value={campos.monto_cerrado ?? ''} onChange={set('monto_cerrado')} placeholder="0.00" />
                </Campo>
                <Campo label="Fecha de cierre">
                  <Texto type="date" value={campos.fecha_cierre ?? ''} onChange={set('fecha_cierre')} />
                </Campo>
              </div>
            )}
          </section>
        </div>

        {error && (
          <div
            className="px-5 py-3 text-sm"
            style={{ background: 'var(--ultra-hot-soft)', color: 'var(--ultra-hot)' }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 p-5" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="submit"
            disabled={guardando}
            className="flex-1 text-sm px-4 py-2.5 rounded-md font-medium transition-all duration-150"
            style={{
              background: 'var(--accent-violet)',
              color: 'white',
              opacity: guardando ? 0.6 : 1,
            }}
          >
            {guardando ? 'Guardando…' : 'Crear lead'}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm px-4 py-2.5 rounded-md"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  )
}
