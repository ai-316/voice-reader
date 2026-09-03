import { useMemo } from 'react'

/** 맑은 새벽 잎사귀 느낌의 배경 — 녹색 계열 */
export default function Backdrop() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 10 + Math.random() * 16,
        delay: Math.random() * 12,
        duration: 9 + Math.random() * 9,
        sway: 18 + Math.random() * 30,
        opacity: 0.3 + Math.random() * 0.4,
        hue: 105 + Math.random() * 30,
      })),
    [],
  )

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {/* 배경 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #DCF3E4 0%, #EAF9EE 40%, #F2FBEF 100%)',
        }}
      />

      {/* 태양 대신 부드러운 초록 빛 */}
      <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(209,235,190,0.9) 0%, rgba(187,220,170,0.45) 45%, rgba(187,220,170,0) 70%)',
        }}
      />

      {/* 흩날리는 잎사귀 */}
      {leaves.map((l) => (
        <span
          key={l.id}
          style={{
            left: `${l.left}%`,
            width: l.size,
            height: l.size * 0.9,
            animationDelay: `${l.delay}s`,
            animationDuration: `${l.duration}s`,
            opacity: l.opacity,
            ['--sway' as string]: `${l.sway}px`,
            background: `linear-gradient(135deg, hsl(${l.hue} 60% 85%), hsl(${l.hue} 55% 68%))`,
          }}
          className="leaf absolute block"
        />
      ))}
    </div>
  )
}
