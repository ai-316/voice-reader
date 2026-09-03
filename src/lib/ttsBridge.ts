/**
 * 안드로이드 네이티브 TTS 서비스와 통신하는 다리(브릿지).
 *
 * 안드로이드의 TtsForeService + TtsPlugin(Java)이 window.TtsNativeBridge 를
 * 깔아주면 이 파일이 감지해서 사용합니다.
 * 브라우저에서 열었을 때는 TTS를 쓸 수 없으므로 사용 불가로 표시됩니다.
 */

export interface TtsStatus {
  state: 'idle' | 'speaking' | 'paused' | 'finished'
  index: number
  total: number
  currentText: string
  rate: number
}

interface NativeBridge {
  start(text: string, rate: number): string
  pause(): string
  resume(): string
  stop(): string
  seekTo(index: number): string
  setRate(rate: number): string
  status(): string
}

declare global {
  interface Window {
    TtsNativeBridge?: NativeBridge
    /** Java가 호출해주는 콜백: 상태가 바뀔 때마다 JSON 문자열로 전달 */
    __ttsOnStatus?: (json: string) => void
  }
}

type Listener = (status: TtsStatus) => void

let listener: Listener | null = null
let poller: number | null = null

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.TtsNativeBridge
}

function readStatus(): TtsStatus | null {
  const b = window.TtsNativeBridge
  if (!b) return null
  try {
    const raw = b.status()
    if (!raw) return null
    return JSON.parse(raw) as TtsStatus
  } catch {
    return null
  }
}

function emit() {
  const s = readStatus()
  if (s && listener) listener(s)
}

/** 상태 변화를 구독합니다. 컴포넌트에서 반환값으로 해제하세요. */
export function onTtsStatus(fn: Listener): () => void {
  listener = fn

  // Java 콜백
  window.__ttsOnStatus = (json: string) => {
    try {
      const s = JSON.parse(json) as TtsStatus
      if (listener) listener(s)
    } catch {
      /* noop */
    }
  }

  // 0.6초마다 상태 폴 (문장 진행 표시용)
  if (poller === null) {
    poller = window.setInterval(emit, 600)
  }
  emit()

  return () => {
    listener = null
    window.__ttsOnStatus = undefined
  }
}

export function ttsStart(text: string, rate: number) {
  window.TtsNativeBridge?.start(text, rate)
  emit()
}

export function ttsPause() {
  window.TtsNativeBridge?.pause()
  emit()
}

export function ttsResume() {
  window.TtsNativeBridge?.resume()
  emit()
}

export function ttsStop() {
  window.TtsNativeBridge?.stop()
  emit()
}

export function ttsSeek(index: number) {
  window.TtsNativeBridge?.seekTo(index)
  emit()
}

export function ttsSetRate(rate: number) {
  window.TtsNativeBridge?.setRate(rate)
  emit()
}
