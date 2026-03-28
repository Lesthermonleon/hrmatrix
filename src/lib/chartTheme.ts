import type { CSSProperties } from 'react'
import type { Theme } from '../context/ThemeContext'

export type ChartThemeTokens = {
  gridStroke: string
  tickFill: string
  tooltipBg: string
  tooltipBorder: string
  tooltipLabel: string
  cursorFill: string
  tooltipContentStyle: CSSProperties
  /** Primary bar / series colors (semantic) */
  series: {
    blue: string
    green: string
    amber: string
    purple: string
    red: string
    muted: string
  }
}

export function getChartTheme(theme: Theme): ChartThemeTokens {
  if (theme === 'dark') {
    return {
      gridStroke: '#2a3444',
      tickFill: '#8899b0',
      tooltipBg: '#111520',
      tooltipBorder: '#1e2535',
      tooltipLabel: '#f0f4f8',
      cursorFill: 'rgba(77, 126, 247, 0.12)',
      tooltipContentStyle: {
        borderRadius: 8,
        border: '1px solid #1e2535',
        background: '#111520',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        color: '#f0f4f8',
      },
      series: {
        blue: '#4d7ef7',
        green: '#10b981',
        amber: '#f59e0b',
        purple: '#a78bfa',
        red: '#fb7185',
        muted: '#64748b',
      },
    }
  }
  return {
    gridStroke: '#e2e8f0',
    tickFill: '#64748b',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    tooltipLabel: '#0f1419',
    cursorFill: '#f1f5f9',
    tooltipContentStyle: {
      borderRadius: 8,
      border: 'none',
      background: '#ffffff',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      color: '#0f1419',
    },
    series: {
      blue: '#3b82f6',
      green: '#10b981',
      amber: '#f59e0b',
      purple: '#8b5cf6',
      red: '#f43f5e',
      muted: '#64748b',
    },
  }
}
