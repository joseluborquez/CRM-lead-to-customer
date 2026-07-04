'use client'

import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center rounded-full p-2 shrink-0"
            style={{ background: 'var(--ultra-hot-soft)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--ultra-hot)' }} />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-md transition-all duration-150 disabled:opacity-50"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-md transition-all duration-150 disabled:opacity-50"
            style={{ background: 'var(--ultra-hot)', color: '#fff' }}
          >
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
