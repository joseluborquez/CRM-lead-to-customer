'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Search } from 'lucide-react'
import { useDebounce } from '@/lib/hooks'

const TIPOS = ['Ultra Hot', 'Hot', 'Warm', 'Cold']
const ESTADOS = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada',
  'Propuesta Enviada', 'Cerrado Ganado', 'Cerrado Perdido', 'Descalificado',
]
const INDUSTRIAS = [
  'Clínica/Salud', 'Agencia', 'Consultora', 'Educación', 'Inmobiliaria', 'Otro',
]

export function LeadFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const tipo = searchParams.get('tipo') ?? ''
  const estado = searchParams.get('estado') ?? ''
  const industria = searchParams.get('industria') ?? ''
  const busqueda = searchParams.get('busqueda') ?? ''

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      startTransition(() => {
        router.push(`/leads?${params.toString()}`)
      })
    },
    [router, searchParams]
  )

  const handleSearch = useDebounce((value: string) => {
    updateParam('busqueda', value)
  }, 300)

  const tipoColor: Record<string, string> = {
    'Ultra Hot': 'var(--ultra-hot)',
    Hot: 'var(--hot)',
    Warm: 'var(--warm)',
    Cold: 'var(--cold)',
  }
  const tipoBg: Record<string, string> = {
    'Ultra Hot': 'var(--ultra-hot-soft)',
    Hot: 'var(--hot-soft)',
    Warm: 'var(--warm-soft)',
    Cold: 'var(--cold-soft)',
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          placeholder="Buscar por nombre o empresa..."
          defaultValue={busqueda}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-md text-sm outline-none transition-all duration-150"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--accent-violet)' }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Tipo pills */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => updateParam('tipo', '')}
            className="text-xs px-3 py-1.5 rounded-md transition-all duration-150"
            style={{
              background: !tipo ? 'var(--accent-violet-soft)' : 'var(--bg-card)',
              color: !tipo ? 'var(--accent-violet)' : 'var(--text-secondary)',
              border: `1px solid ${!tipo ? 'var(--accent-violet)' : 'var(--border)'}`,
            }}
          >
            Todos
          </button>
          {TIPOS.map((t) => (
            <button
              key={t}
              onClick={() => updateParam('tipo', tipo === t ? '' : t)}
              className="text-xs px-3 py-1.5 rounded-md transition-all duration-150 font-medium"
              style={{
                background: tipo === t ? tipoBg[t] : 'var(--bg-card)',
                color: tipo === t ? tipoColor[t] : 'var(--text-secondary)',
                border: `1px solid ${tipo === t ? tipoColor[t] : 'var(--border)'}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Estado dropdown */}
        <select
          value={estado}
          onChange={(e) => updateParam('estado', e.target.value)}
          className="text-sm px-3 py-1.5 rounded-md outline-none transition-all duration-150"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: estado ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        {/* Industria dropdown */}
        <select
          value={industria}
          onChange={(e) => updateParam('industria', e.target.value)}
          className="text-sm px-3 py-1.5 rounded-md outline-none transition-all duration-150"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: industria ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <option value="">Todas las industrias</option>
          {INDUSTRIAS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
