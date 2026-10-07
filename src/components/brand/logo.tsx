// ─── MEDULA BRAND ───
// MEDULA — from "medulla oblongata", the body's vital control centre.
// One mark, everywhere: a clay gradient tile carrying a stroked M whose
// valley hides a live ECG blip, with a synapse spark on the apex.
// Pure SVG — crisp at every size, zero dependencies.

const GRAD_ID = 'medula-grad'

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="MEDULA logo"
      className={className}
    >
      <defs>
        <linearGradient id={GRAD_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0e7f8f" />
          <stop offset="52%" stopColor="#14919e" />
          <stop offset="100%" stopColor="#2fae8f" />
        </linearGradient>
        <radialGradient id="medula-gloss" cx="28%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id="medula-spark" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* porcelain tile */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill={`url(#${GRAD_ID})`} />
      {/* glass gloss */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill="url(#medula-gloss)" />
      {/* inner rim light */}
      <rect x="2.6" y="2.6" width="42.8" height="42.8" rx="11.6" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />

      {/* the M — anatomical strokes */}
      <path
        d="M11 34.5 V15.5 L24 27.5 L37 15.5 V34.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ECG blip living in the M's valley */}
      <path
        d="M15.5 24.5 h3.2 l1.6 -2.6 l2.4 5.2 l1.8 -2.6 h3.4"
        fill="none"
        stroke="#f7e3bd"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />

      {/* synapse spark on the apex */}
      <circle cx="37" cy="15.5" r="2.6" fill="#f2cf8d" filter="url(#medula-spark)" />
      <circle cx="37" cy="15.5" r="4.6" fill="none" stroke="#f2cf8d" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  )
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-display block text-[15px] font-bold leading-none tracking-tight">MEDULA</span>
      <span className="mt-0.5 block text-[8.5px] font-semibold uppercase tracking-[0.24em] text-ink-soft">
        Medical Learning OS
      </span>
    </span>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 32 : 38} />
      {!compact && <LogoWordmark />}
    </span>
  )
}
