import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../lib/supabase'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

export function LoginPage() {
  const { signIn, loginAttempts, lockedUntil } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) { setCountdown(0); return }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setCountdown(remaining)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  // 3D tilt on card
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const dx = (e.clientX - cx) / cx
      const dy = (e.clientY - cy) / cy
      card.style.transform = `perspective(1200px) rotateY(${dx * 2}deg) rotateX(${-dy * 1.5}deg)`
    }
    const onLeave = () => { card.style.transform = 'perspective(1200px) rotateY(0) rotateX(0)' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave) }
  }, [])

  const isLocked = lockedUntil != null && Date.now() < lockedUntil

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return
    if (!email.trim() || !password.trim()) { setError('Please enter both email and password.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await signIn(email, password)
    if (err) setError(err)
    setLoading(false)
  }

  const attemptsLeft = Math.max(0, 3 - loginAttempts)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Grid bg */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(#2a2a32 1px, transparent 1px), linear-gradient(90deg, #2a2a32 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: .35, maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(90,90,140,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Login card */}
      <div ref={cardRef} style={{
        background: '#111114', border: '1px solid #2a2a32', borderRadius: 20, padding: '52px 48px',
        position: 'relative', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,.03) inset, 0 40px 80px rgba(0,0,0,.6), 0 0 80px rgba(60,60,100,.12)',
        width: '100%', maxWidth: 440, zIndex: 1, transition: 'transform .1s ease'
      }}>
        {/* Corner accents */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, borderTop: '1px solid #3e3e4a', borderLeft: '1px solid #3e3e4a', borderRadius: '20px 0 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 60, height: 60, borderBottom: '1px solid #3e3e4a', borderRight: '1px solid #3e3e4a', borderRadius: '0 0 20px 0', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#18181d', border: '1px solid #3e3e4a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c8c8e0' }}>👥</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '.04em', color: '#e8e8f0' }}>HRMatrix</div>
            <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: '#4a4a58' }}>Management Suite</div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #2a2a32, transparent)', marginBottom: 36 }} />

        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-.02em', color: '#e8e8f0', marginBottom: 6 }}>Sign in to continue</div>
        <div style={{ fontSize: 13, color: '#7a7a90', fontWeight: 300, marginBottom: 36 }}>Enter your credentials to access the system</div>

        {/* Lockout banner */}
        {isLocked && (
          <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '.78rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 Too many failed attempts. Try again in <strong>{countdown}s</strong>
          </div>
        )}

        {/* Error */}
        {error && !isLocked && (
          <div style={{ background: 'rgba(208,48,39,0.1)', border: '1px solid rgba(208,48,39,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '.78rem', color: '#f87171' }}>
            ⚠ {error}
            {loginAttempts > 0 && loginAttempts < 3 && (
              <div style={{ marginTop: 4, opacity: .8 }}>{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout.</div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7a7a90', marginBottom: 8 }}>Email Address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@company.com" disabled={isLocked}
              style={{ width: '100%', padding: '11px 14px', background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#e8e8f0', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7a7a90', marginBottom: 8 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="Enter your password" disabled={isLocked}
                style={{ width: '100%', padding: '11px 44px 11px 14px', background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#e8e8f0', fontSize: '.88rem', outline: 'none', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a4a58', cursor: 'pointer', fontSize: 14 }}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#4a4a58', marginTop: 4 }}>Min. 8 characters with at least one uppercase letter and number</div>
          </div>

          <button
            type="submit" disabled={loading || isLocked}
            style={{
              width: '100%', padding: '13px', background: (loading || isLocked) ? '#2a2a32' : '#e8e8f0', border: 'none',
              borderRadius: 10, fontFamily: "'Syne', sans-serif", fontSize: '.9rem', fontWeight: 700,
              letterSpacing: '.04em', color: '#0a0a0b', cursor: (loading || isLocked) ? 'not-allowed' : 'pointer',
              transition: 'all .2s', marginTop: 16
            }}
          >
            {isLocked ? `Locked — ${countdown}s` : loading ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '.72rem', color: '#4a4a58' }}>
          v1.0.0 — HRMatrix © 2026
        </div>

        <div style={{ height: 50, marginTop: 10, opacity: 0.3, pointerEvents: 'none' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[
              { time: 1, users: 10 }, { time: 2, users: 15 }, { time: 3, users: 8 },
              { time: 4, users: 20 }, { time: 5, users: 25 }, { time: 6, users: 18 }, { time: 7, users: 30 }
            ]}>
              <Area type="monotone" dataKey="users" stroke="#e8e8f0" fill="#e8e8f0" fillOpacity={0.1} strokeWidth={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
