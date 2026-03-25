import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)

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

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setError('')
  try {
    const { error: err } = await signIn(email, password)
    if (err) {
      setError(err)
    }
  } catch (e) {
    setError('Something went wrong. Check console.')
    console.error(e)
  } finally {
    setLoading(false)
  }
}

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Grid bg */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(#2a2a32 1px, transparent 1px), linear-gradient(90deg, #2a2a32 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: .35, maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(90,90,140,.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Left brand panel */}
      <div style={{ flex: 1, padding: '60px 48px', maxWidth: 480, display: 'none' }} className="brand-panel-left">
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '.25em', textTransform: 'uppercase', color: '#b8a878', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'block', width: 28, height: 1, background: '#b8a878' }}></span>
          Human Resources Platform
        </div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(2.4rem, 3.2vw, 3.2rem)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-.02em', color: '#e8e8f0', marginBottom: 24 }}>
          People,<br /><span style={{ color: '#7a7a90' }}>Performance</span><br />& Payroll.
        </h1>
        <p style={{ fontSize: 14, fontWeight: 300, color: '#a0a0b8', lineHeight: 1.75, maxWidth: 340, marginBottom: 48 }}>
          Centralize your workforce operations — from talent acquisition through payroll compliance in one unified system.
        </p>
      </div>

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
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#18181d', border: '1px solid #3e3e4a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c8c8e0' }}>
            👥
          </div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '.04em', color: '#e8e8f0' }}>HRMatrix</div>
            <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: '#4a4a58' }}>Management Suite</div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #2a2a32, transparent)', marginBottom: 36 }} />

        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '1.55rem', fontWeight: 700, letterSpacing: '-.02em', color: '#e8e8f0', marginBottom: 6 }}>Sign in to continue</div>
        <div style={{ fontSize: 13, color: '#7a7a90', fontWeight: 300, marginBottom: 36 }}>Enter your credentials to access the system</div>

        {error && (
          <div style={{ background: 'rgba(208,48,39,0.1)', border: '1px solid rgba(208,48,39,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '.78rem', color: '#f87171' }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7a7a90', marginBottom: 8 }}>Email Address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@company.com"
              style={{ width: '100%', padding: '11px 14px 11px 40px', background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#e8e8f0', fontSize: '.88rem', outline: 'none' }}
            />
          </div>

          <div style={{ marginBottom: 20, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7a7a90', marginBottom: 8 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="Enter your password"
                style={{ width: '100%', padding: '11px 44px 11px 40px', background: '#18181d', border: '1px solid #2a2a32', borderRadius: 8, color: '#e8e8f0', fontSize: '.88rem', outline: 'none' }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a4a58', cursor: 'pointer', fontSize: 14 }}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '13px', background: loading ? '#2a2a32' : '#e8e8f0', border: 'none',
              borderRadius: 10, fontFamily: "'Syne', sans-serif", fontSize: '.9rem', fontWeight: 700,
              letterSpacing: '.04em', color: '#0a0a0b', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all .2s', marginTop: 8
            }}
          >
            {loading ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '.72rem', color: '#4a4a58' }}>
          v1.0.0 — HRMatrix © 2026
        </div>
      </div>
    </div>
  )
}
