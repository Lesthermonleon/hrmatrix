import React from 'react'

interface SkeletonLoaderProps {
  type?: 'dashboard' | 'table' | 'stats'
}

export function SkeletonLoader({ type = 'dashboard' }: SkeletonLoaderProps) {
  if (type === 'table') {
    return (
      <div className="card">
        <div className="card-hd">
          <span className="sk sk-text" style={{ width: 140 }} />
          <span className="sk sk-btn" style={{ width: 70 }} />
        </div>
        <div style={{ padding: '12px 18px' }}>
          {[...Array(6)].map((_, i) => (
            <span key={i} className="sk sk-row" style={{ marginBottom: 6, opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </div>
    )
  }

  if (type === 'stats') {
    return (
      <div className="skel-stat-grid">
        {[...Array(4)].map((_, i) => (
          <span key={i} className="sk sk-stat" />
        ))}
      </div>
    )
  }

  // default: 'dashboard'
  return (
    <div className="skel-wrap">
      {/* Page header skeleton */}
      <div style={{ marginBottom: 24 }}>
        <span className="sk sk-text-sm" style={{ width: 100, marginBottom: 10 }} />
        <span className="sk sk-title" style={{ width: 260, marginBottom: 8 }} />
        <span className="sk sk-text-sm" style={{ width: 200 }} />
      </div>

      {/* Stat tiles */}
      <div className="skel-stat-grid">
        {[...Array(6)].map((_, i) => (
          <span key={i} className="sk sk-stat" />
        ))}
      </div>

      {/* Section label */}
      <span className="sk sk-text-sm" style={{ width: 100, marginBottom: 14 }} />

      {/* Two cards side-by-side */}
      <div className="skel-panel">
        <span className="sk sk-card" />
        <span className="sk sk-card" />
      </div>

      {/* Bottom wide card */}
      <span className="sk sk-card" style={{ width: '100%', height: 180 }} />
    </div>
  )
}
