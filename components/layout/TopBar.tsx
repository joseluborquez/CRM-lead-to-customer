'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function getSaludo(): string {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

interface TopBarProps {
  titulo: string
}

export function TopBar({ titulo }: TopBarProps) {
  const [fechaStr, setFechaStr] = useState('')
  const [saludo, setSaludo] = useState('')

  useEffect(() => {
    const now = new Date()
    setFechaStr(
      format(now, "EEEE, d 'de' MMMM yyyy", { locale: es })
        .replace(/^\w/, (c) => c.toUpperCase())
    )
    setSaludo(getSaludo())
  }, [])

  return (
    <div
      className="flex items-center justify-between px-6 py-4"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {titulo}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {fechaStr}
        </p>
      </div>
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {saludo}, <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>José Luis</span>
      </div>
    </div>
  )
}
