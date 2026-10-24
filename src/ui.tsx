/** Small reusable building blocks shared by the screens. */
import { type ReactNode, useEffect, useState } from 'react'
import { go } from './router'

export function TopBar({ title, sub, onSub }: { title: string; sub?: string; onSub?: () => void }) {
  return (
    <header className="topbar">
      <button className="nav-btn" onClick={go.home} aria-label="Home">
        <HomeIcon /> Home
      </button>
      {sub && (
        <button className="nav-btn nav-sub" onClick={onSub}>
          <span aria-hidden>‹</span> {sub}
        </button>
      )}
      <h1>{title}</h1>
    </header>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z" />
    </svg>
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="screen">{children}</main>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

/** − value + control. Big buttons; no typing needed. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
        −
      </button>
      <output className="step-value">{value}</output>
      <button type="button" className="step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="error" role="alert">
      {message}
    </div>
  )
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>
}

/** A short message that fades away by itself (e.g. "All 8 targets recorded"). */
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2500)
    return () => clearTimeout(t)
  }, [msg])
  const el = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
  return [el, setMsg]
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
