'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError('Credenciales incorrectas. Verifica tu email y contraseña.')
        return
      }

      router.push('/')
      router.refresh()
    })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'var(--bg-base)',
        backgroundImage: `
          linear-gradient(var(--border) 1px, transparent 1px),
          linear-gradient(90deg, var(--border) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }}
    >
      <div
        className="w-full flex flex-col gap-8 p-8"
        style={{
          maxWidth: '400px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-violet-soft)', border: '1px solid var(--border-accent)' }}
          >
            <Zap size={22} style={{ color: 'var(--accent-violet)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Lead to Customer
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              NoCode Jose — Sistema interno
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              className="px-3 py-2.5 rounded-md text-sm outline-none transition-all duration-150"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent-violet)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 pr-10 rounded-md text-sm outline-none transition-all duration-150"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-violet)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-150"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm"
              style={{
                background: 'var(--ultra-hot-soft)',
                border: '1px solid var(--ultra-hot)',
                color: 'var(--ultra-hot)',
              }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !email || !password}
            className="flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isPending ? 'var(--border-accent)' : 'linear-gradient(135deg, #7C5CFC, #9B79FF)',
              color: '#fff',
            }}
            onMouseEnter={(e) => {
              if (!isPending) e.currentTarget.style.filter = 'brightness(1.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = ''
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          Acceso exclusivo para el equipo de NoCode Jose
        </p>
      </div>
    </div>
  )
}
