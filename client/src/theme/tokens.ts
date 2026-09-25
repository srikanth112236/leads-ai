/**
 * App-wide design tokens. Every new UI must derive colors, radius and
 * spacing from here – no ad-hoc hex codes or arbitrary radii.
 */
import type { CSSProperties } from 'react';

export const colors = {
  brand: {
    50: '#eef2ff',
    100: '#e0e7ff',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
  },
  success: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  warning: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  danger: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  info: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  neutral: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  sidebar: {
    bg: '#ffffff',
    border: '#e2e8f0',
    text: '#475569',
    textActive: '#4338ca',
    activeBg: '#eef2ff',
    hoverBg: '#f8fafc',
  },
} as const;

/** Minimal radius system – cards/inputs/buttons default to lg. */
export const radius = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  pill: 'rounded-full',
} as const;

export const cardClass =
  'bg-white rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)]';

export const inputClass =
  'w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white';

export function statusBadge(): string {
  return `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border`;
}

export function statusBadgeStyle(kind: 'success' | 'warning' | 'danger' | 'info' | 'neutral'): CSSProperties {
  const c = colors[kind];
  return { background: c.bg, color: c.text, borderColor: c.border };
}
