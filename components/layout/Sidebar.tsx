'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutDashboard, Kanban, Users, Bell, Zap, LogOut } from 'lucide-react'
import { useEffect, useState, Suspense } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getFollowUpsHoy } from '@/lib/queries'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/leads', label: 'Leads', icon: Users },
]

function FollowUpLink({ followUpsCount }: { followUpsCount: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const followUpActive = pathname === '/leads' && searchParams.get('filter') === 'followup'

  return (
    <Link
      href="/leads?filter=followup"
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150"
      style={{
        background: followUpActive ? 'var(--accent-violet-soft)' : 'transparent',
        color: followUpActive ? 'var(--accent-violet)' : 'var(--text-secondary)',
        fontWeight: followUpActive ? '500' : '400',
      }}
      onMouseEnter={(e) => {
        if (!followUpActive) {
          e.currentTarget.style.background = 'var(--bg-hover)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!followUpActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-secondary)'
        }
      }}
    >
      <Bell size={16} />
      <span className="flex-1">Follow-ups</span>
      {followUpsCount > 0 && (
        <span
          className="flex items-center justify-center text-xs font-semibold rounded-full min-w-5 h-5 px-1"
          style={{ background: 'var(--ultra-hot)', color: '#fff', fontSize: '10px' }}
        >
          {followUpsCount}
        </span>
      )}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [followUpsCount, setFollowUpsCount] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    getFollowUpsHoy()
      .then((leads) => setFollowUpsCount(leads.length))
      .catch(() => setFollowUpsCount(0))
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const userInitial = user?.email?.[0]?.toUpperCase() ?? '?'
  const userEmail = user?.email ?? ''

  return (
    <aside
      className="flex flex-col shrink-0 h-screen sticky top-0"
      style={{
        width: '220px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex flex-col gap-1 px-5 py-6" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md"
            style={{ background: 'var(--accent-violet-soft)' }}
          >
            <Zap size={14} style={{ color: 'var(--accent-violet)' }} />
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Lead to Customer
          </span>
        </div>
        <span className="text-xs pl-9" style={{ color: 'var(--text-muted)' }}>
          by NoCode Jose
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150"
              style={{
                background: active ? 'var(--accent-violet-soft)' : 'transparent',
                color: active ? 'var(--accent-violet)' : 'var(--text-secondary)',
                fontWeight: active ? '500' : '400',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          )
        })}

        <Suspense fallback={
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Bell size={16} />
            <span className="flex-1">Follow-ups</span>
          </div>
        }>
          <FollowUpLink followUpsCount={followUpsCount} />
        </Suspense>
      </nav>

      {/* Footer */}
      <div
        className="flex flex-col gap-3 px-4 py-4"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full pulse-dot shrink-0"
            style={{ background: 'var(--success)', display: 'inline-block' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Sistema Activo
          </span>
        </div>

        {user && (
          <div
            className="flex items-center gap-2 p-2 rounded-md"
            style={{ background: 'var(--bg-hover)' }}
          >
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-xs font-bold"
              style={{ background: 'var(--accent-violet-soft)', color: 'var(--accent-violet)' }}
            >
              {userInitial}
            </div>
            <span
              className="text-xs truncate flex-1 min-w-0"
              style={{ color: 'var(--text-muted)' }}
              title={userEmail}
            >
              {userEmail}
            </span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all duration-150 disabled:opacity-50"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ultra-hot-soft)'
            e.currentTarget.style.color = 'var(--ultra-hot)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <LogOut size={13} />
          <span>{signingOut ? 'Cerrando...' : 'Cerrar sesión'}</span>
        </button>
      </div>
    </aside>
  )
}
