import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../context/ThemeContext'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { getChartTheme } from '../lib/chartTheme'

export function LoginPage() {
  const { signIn, loginAttempts, lockedUntil, authRedirectNotice, clearAuthRedirectNotice } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const chart = getChartTheme(theme)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

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
  const sparkStroke = chart.tickFill

  return (
    <div className="login-root">
      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="login-grid-bg" aria-hidden />
      <div className="login-glow" aria-hidden />

      <div ref={cardRef} className="login-card">
        <div className="login-corner-tl" aria-hidden />
        <div className="login-corner-br" aria-hidden />

        <div className="login-brand-row">
          <div className="login-logo-box">👥</div>
          <div>
            <div className="login-brand-name">HRMatrix</div>
            <div className="login-brand-sub">Management Suite</div>
          </div>
        </div>

        <div className="login-divider" />

        <div className="login-title">Sign in to continue</div>
        <div className="login-sub">Enter your credentials to access the system</div>

        {authRedirectNotice && (
          <div className="login-banner-error" style={{ display: 'block' }}>
            <div style={{ marginBottom: 8 }}>{authRedirectNotice}</div>
            <button type="button" className="btn btn-ghost btn-xs" style={{ padding: 0, border: 'none', color: 'inherit', opacity: 0.85 }} onClick={clearAuthRedirectNotice}>
              Dismiss
            </button>
          </div>
        )}

        {isLocked && (
          <div className="login-banner-lock">
            🔒 Too many failed attempts. Try again in <strong>{countdown}s</strong>
          </div>
        )}

        {error && !isLocked && (
          <div className="login-banner-error">
            ⚠ {error}
            {loginAttempts > 0 && loginAttempts < 3 && (
              <div style={{ marginTop: 4, opacity: .8 }}>{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before temporary lockout.</div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-form-grp">
            <label className="login-label" htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              className="login-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              disabled={isLocked}
            />
          </div>

          <div className="login-form-grp login-form-grp-tight">
            <label className="login-label" htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <input
                id="login-password"
                className="login-input login-input-pw"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                disabled={isLocked}
              />
              <button type="button" className="login-toggle-pw" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>

          </div>

          <button type="submit" className="login-submit" disabled={loading || isLocked}>
            {isLocked ? `Locked — ${countdown}s` : loading ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          v1.0.0 — HRMatrix © 2026
        </div>

        <div className="login-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[
              { time: 1, users: 10 }, { time: 2, users: 15 }, { time: 3, users: 8 },
              { time: 4, users: 20 }, { time: 5, users: 25 }, { time: 6, users: 18 }, { time: 7, users: 30 },
            ]}>
              <Area type="monotone" dataKey="users" stroke={sparkStroke} fill={sparkStroke} fillOpacity={0.12} strokeWidth={1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
