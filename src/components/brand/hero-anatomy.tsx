'use client'

// ─── HERO ANATOMY — the porcelain-atelier hero composition ──────────────────
// An original, scientific line-art scene: a gently beating anatomical heart
// resting on a porcelain podium, orbited by knowledge nodes, with a drifting
// brain and lungs, a champagne molecule and a live ECG trace.
// Pure SVG + CSS animations — no WebGL, no heavy libs, reduced-motion safe.

import { cn } from '@/lib/utils'

const TEAL = '#16788c'
const TEAL_SOFT = '#4d9aa8'
const CORAL = '#c97e59'
const CHAMPAGNE = '#d9ad6e'
const MINT = '#5cb491'
const INK_SOFT = '#8a7f70'

export function HeroAnatomy({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none select-none', className)} aria-hidden>
      <svg viewBox="0 0 480 360" className="h-auto w-full" fill="none">
        <defs>
          <radialGradient id="ha-pool" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={INK_SOFT} stopOpacity="0.28" />
            <stop offset="100%" stopColor={INK_SOFT} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ha-heart" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f6e0d2" />
            <stop offset="100%" stopColor="#f0cdb8" />
          </linearGradient>
          <linearGradient id="ha-lung" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e2f1e8" />
            <stop offset="100%" stopColor="#d3e9dd" />
          </linearGradient>
          <linearGradient id="ha-brain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e3eef2" />
            <stop offset="100%" stopColor="#d2e5ea" />
          </linearGradient>
        </defs>

        {/* orbit — the knowledge system around the organ */}
        <g opacity="0.65">
          <ellipse cx="240" cy="178" rx="196" ry="112" stroke={TEAL_SOFT} strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="3 7" />
          <ellipse cx="240" cy="178" rx="146" ry="82" stroke={CHAMPAGNE} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="2 6" />
        </g>

        {/* orbit nodes — tiny instruments on the knowledge orbit */}
        <g className="glyph-float-slow">
          <circle cx="60" cy="150" r="13" fill="#fdfaf3" stroke={TEAL_SOFT} strokeOpacity="0.55" />
          <path d="M60 144v12M54 150h12" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round" />
        </g>
        <g className="glyph-float-fast">
          <circle cx="424" cy="216" r="13" fill="#fdfaf3" stroke={CHAMPAGNE} strokeOpacity="0.6" />
          <rect x="416.5" y="212" width="15" height="8" rx="4" transform="rotate(-28 424 216)" stroke={CHAMPAGNE} strokeWidth="1.6" />
          <path d="M419 219l4-4" stroke={CHAMPAGNE} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className="glyph-float">
          <circle cx="356" cy="86" r="11" fill="#fdfaf3" stroke={MINT} strokeOpacity="0.6" />
          <path d="M350 86h3l2.5-5 3 9 2.5-4h3" stroke={MINT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* lungs — left, drifting */}
        <g className="glyph-float-slow" opacity="0.94">
          <path
            d="M121 132c-3-8-11-12-16-8-3 2-4 6-4 11v52c0 18 8 32 20 36 9 3 17-3 17-13v-45c0-14-6-26-17-33z"
            fill="url(#ha-lung)" stroke={MINT} strokeWidth="2" strokeLinejoin="round"
          />
          <path
            d="M175 132c3-8 11-12 16-8 3 2 4 6 4 11v52c0 18-8 32-20 36-9 3-17-3-17-13v-45c0-14 6-26 17-33z"
            fill="url(#ha-lung)" stroke={MINT} strokeWidth="2" strokeLinejoin="round"
          />
          <path d="M148 96v22c0 5-4 9-9 10M148 118c0 5 4 9 9 10" stroke={MINT} strokeWidth="2" strokeLinecap="round" />
          <path d="M140 88c2-6 14-6 16 0" stroke={MINT} strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* brain — upper right, drifting */}
        <g className="glyph-float" opacity="0.95">
          <path
            d="M300 66c-8-10-24-10-31-2-11-4-24 2-26 13-9 3-12 14-7 21-3 9 3 18 12 19 5 8 17 10 25 5 9 6 22 3 26-6 8-3 12-13 8-20 4-8 0-18-7-21z"
            fill="url(#ha-brain)" stroke={TEAL_SOFT} strokeWidth="2" strokeLinejoin="round"
          />
          <path d="M282 70c-6 6-5 14 1 19m-18-13c7 1 11 6 11 13m19-16c-3 7 0 13 6 16m-30 22c2-7 8-10 15-9" stroke={TEAL_SOFT} strokeWidth="1.6" strokeLinecap="round" />
        </g>

        {/* molecule — champagne, drifting near the brain */}
        <g className="glyph-float-fast" opacity="0.9">
          <circle cx="404" cy="120" r="7" fill="#f8ecd6" stroke={CHAMPAGNE} strokeWidth="1.8" />
          <circle cx="428" cy="138" r="5.5" fill="#f8ecd6" stroke={CHAMPAGNE} strokeWidth="1.6" />
          <circle cx="404" cy="156" r="5.5" fill="#f8ecd6" stroke={CHAMPAGNE} strokeWidth="1.6" />
          <path d="M409 125l13 9m-13 16l13-8m-18-14v20" stroke={CHAMPAGNE} strokeWidth="1.5" />
        </g>

        {/* the heart — centre, gently beating */}
        <g style={{ animation: 'medos-beat 3.4s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}>
          {/* soft pool shadow */}
          <ellipse cx="243" cy="290" rx="96" ry="16" fill="url(#ha-pool)" />
          {/* great vessels */}
          <path d="M225 84c0-10 10-16 19-13 8 3 11 11 8 20l-6 16" stroke={CORAL} strokeWidth="7" strokeLinecap="round" />
          <path d="M262 92c8-8 22-6 26 3 4 8-1 17-9 20l-14 5" stroke={CORAL} strokeWidth="6" strokeLinecap="round" opacity="0.85" />
          <path d="M212 96c-7-4-17-1-19 7-2 7 3 13 11 14l12 1" stroke={CORAL} strokeWidth="5.5" strokeLinecap="round" opacity="0.8" />
          {/* body */}
          <path
            d="M226 118c-20-20-58-16-68 20-10 38 14 82 56 114 12 9 30 10 42 0 42-32 66-76 56-114-10-36-48-40-68-20z"
            fill="url(#ha-heart)" stroke={CORAL} strokeWidth="2.6" strokeLinejoin="round"
          />
          {/* coronary groove + detail — the craft lines */}
          <path d="M188 168c14 12 34 18 52 18s38-6 52-18" stroke={CORAL} strokeWidth="1.6" strokeOpacity="0.55" strokeLinecap="round" />
          <path d="M212 138c8 6 20 9 30 9" stroke={CORAL} strokeWidth="1.4" strokeOpacity="0.4" strokeLinecap="round" />
          <path d="M240 196v52" stroke={CORAL} strokeWidth="1.4" strokeOpacity="0.35" strokeLinecap="round" />
          {/* atria line */}
          <path d="M214 128c8-8 20-11 30-8" stroke={CORAL} strokeWidth="1.4" strokeOpacity="0.45" strokeLinecap="round" />
        </g>

        {/* ECG trace — the live signal under everything */}
        <g opacity="0.8">
          <path
            className="ecg-line"
            d="M52 316h58l9-16 12 30 11-24 8 10h74l9-16 12 30 11-24 8 10h76l9-16 12 30 11-24 8 10h44"
            stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
          <path
            d="M52 316h58l9-16 12 30 11-24 8 10h74l9-16 12 30 11-24 8 10h76l9-16 12 30 11-24 8 10h44"
            stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.14"
          />
        </g>
      </svg>
    </div>
  )
}
