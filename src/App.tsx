import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  Square,
  Volume2,
} from 'lucide-react'
import appConfig from './config/app.json'
import Backdrop from './components/Backdrop'
import { ttsAvailable, onTtsStatus, ttsStart, ttsPause, ttsResume, ttsStop, ttsSeek, ttsSetRate } from './lib/ttsBridge'

type Screen = 'input' | 'reader'
type PlayState = 'idle' | 'speaking' | 'paused' | 'finished'

const SPEEDS = [0.75, 1.0, 1.3] as const
const SPEED_NAMES = [appConfig.reader.speedSlow, appConfig.reader.speedNormal, appConfig.reader.speedFast]

/** 입력 글을 문장 목록으로도 미리 보기 (읽기 화면 미리보기용으로 저장) */
function splitSentencesPreview(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。…・\n,，;:])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(Boolean)
}

export default function App() {
  const nativeReady = ttsAvailable()
  const [screen, setScreen] = useState<Screen>('input')
  const [inputText, setInputText] = useState('')
  const [confirmedText, setConfirmedText] = useState('')
  const [speedIdx, setSpeedIdx] = useState(1) // 0.75 / 1.0 / 1.3
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [segIndex, setSegIndex] = useState(0)
  const [segTotal, setSegTotal] = useState(0)
  const [currentLine, setCurrentLine] = useState('')
  const [segmentsPreview, setSegmentsPreview] = useState<string[]>([])
  const [pasteMsg, setPasteMsg] = useState<string | null>(null)
  const pasteTimer = useRef<number | null>(null)

  const rate = SPEEDS[speedIdx]
  const charCount = inputText.replace(/\s/g, '').length
  const approxMin = Math.max(1, Math.round((charCount / 260) / rate))

  // 앱 처음 열 때 네이티브에 저장된 글 복원
  useEffect(() => {
    if (!nativeReady) return
    try {
      const t = (window as any).TtsNativeBridge?.savedText()
      const r = (window as any).TtsNativeBridge?.savedRate()
      if (t) {
        setInputText(t)
        // 마지막 글이 있으면 바로 읽을 수 있게 확인된 상태로 준비합니다
        setConfirmedText(t)
        setScreen('reader')
        setSegmentsPreview(splitSentencesPreview(t))
      }
      if (typeof r === 'number') {
        const i = SPEEDS.indexOf(r as typeof SPEEDS[number])
        if (i >= 0) setSpeedIdx(i)
      }
    } catch { /* noop */ }
  }, [nativeReady])

  // 네이티브 상태 구독
  useEffect(() => {
    if (!nativeReady) return
    const off = onTtsStatus((s: any) => {
      setPlayState(s.state as PlayState)
      setSegIndex(s.index)
      setSegTotal(s.total)
      setCurrentLine(s.currentText || '')
      if (s.total > 0 && segmentsPreview.length === 0) {
        // 로딩된 상태면 서비스가 잘린 문장으로 화면을 채웁니다
        setSegmentsPreview([])
      }
    })
    return off
  }, [nativeReady, segmentsPreview.length])

  // 붙여넣기 버튼
  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim()) {
        setInputText(text.trim())
        setPasteMsg('붙여넣었어요')
      } else {
        setPasteMsg('클립보드가 비어있어요')
      }
    } catch {
      // 권한 안내 대신 수동 붙여넣기 유도
      setPasteMsg('직접 길게 눌러서 붙여넣어 주세요')
    }
    if (pasteTimer.current) window.clearTimeout(pasteTimer.current)
    pasteTimer.current = window.setTimeout(() => setPasteMsg(null), 2200)
  }, [])

  // 확인 → 읽기 모드 진입
  const confirmText = useCallback(() => {
    const t = inputText.trim()
    if (!t) {
      setPasteMsg('먼저 글을 입력해 주세요')
      if (pasteTimer.current) window.clearTimeout(pasteTimer.current)
      pasteTimer.current = window.setTimeout(() => setPasteMsg(null), 2200)
      return
    }
    setConfirmedText(t)
    setSegmentsPreview(splitSentencesPreview(t))
    setScreen('reader')
    setPlayState('idle')
    setSegIndex(0)
    setSegTotal(0)
  }, [inputText])

  const handlePlay = () => {
    if (!confirmedText.trim()) return
    ttsStart(confirmedText, rate)
  }
  const handlePause = () => ttsPause()
  const handleResume = () => ttsResume()
  const handleReset = () => {
    ttsStop()
    setPlayState('idle')
    setSegIndex(0)
    setSegTotal(confirmedText ? segmentsPreview.length : 0)
  }
  const handleNewInput = () => {
    ttsStop()
    setScreen('input')
  }
  const handleSpeedChange = (idx: number) => {
    setSpeedIdx(idx)
    ttsSetRate(SPEEDS[idx])
  }
  const seekTo = (idx: number) => ttsSeek(idx)

  const totalDisplay = segTotal > 0 ? segTotal : segmentsPreview.length
  const pct = totalDisplay > 0 ? Math.min(100, (segIndex / totalDisplay) * 100) : 0

  const isPlaying = playState === 'speaking'
  const isPaused = playState === 'paused'
  const isFinished = playState === 'finished'

  return (
    <div className="font-body relative min-h-dvh text-stone-800">
      <Backdrop />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-6 pb-10 pt-10">

        {/* 헤더 */}
        <header className="animate-rise flex items-center gap-3">
          {screen === 'reader' ? (
            <button
              onClick={handleNewInput}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 text-stone-500 backdrop-blur-sm transition hover:text-emerald-600"
              aria-label="새로 입력"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
            </button>
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 shadow-lg shadow-green-200">
              <Headphones className="h-6 w-6 text-white" strokeWidth={2.3} />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-bold leading-none text-stone-800">{appConfig.title}</h1>
            <p className="mt-1.5 text-[12px] text-stone-500">{appConfig.subtitle}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700">
            {screen === 'input' ? '1단계' : '2단계'}
          </span>
        </header>

        {/* 입력 화면 */}
        {screen === 'input' && (
          <div className="animate-rise mt-7 flex-1 flex flex-col" style={{ animationDelay: '90ms' }}>
            <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-stone-600">
              <FileText className="h-4 w-4 text-emerald-600" strokeWidth={2.2} />
              {appConfig.input.label}
            </label>
            <div className="relative flex-1 rounded-3xl bg-white/75 p-4 shadow-md backdrop-blur-md min-h-[260px]">
              <textarea
                className="h-full w-full resize-none rounded-2xl bg-transparent p-2 text-[15px] leading-relaxed outline-none placeholder:text-stone-400"
                placeholder={appConfig.input.placeholder}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              {charCount > 0 && (
                <span className="absolute bottom-3 right-4 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
                  {appConfig.input.chars.replace('{n}', String(charCount))} · 약 {approxMin}분
                </span>
              )}
            </div>

            {pasteMsg && (
              <p className="mt-2 text-center text-[12.5px] font-semibold text-emerald-600">{pasteMsg}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={pasteFromClipboard} className="btn-soft">
                <Copy className="h-4.5 w-4.5 text-emerald-600" strokeWidth={2.3} />
                {appConfig.input.pasteButton}
              </button>
              <button
                onClick={confirmText}
                disabled={!charCount}
                className={`btn-primary ${!charCount ? 'opacity-50' : ''}`}
              >
                <Check className="h-4.5 w-4.5" strokeWidth={2.5} />
                {appConfig.input.confirm}
              </button>
            </div>
          </div>
        )}

        {/* 읽기 화면 */}
        {screen === 'reader' && (
          <>
            {/* 상태 배지 + 진행 */}
            <div className="animate-rise mt-7 rounded-2xl bg-white/70 px-4 py-3 backdrop-blur-sm" style={{ animationDelay: '90ms' }}>
              <div className="flex items-center justify-between text-[12px]">
                <span className={`font-bold ${
                  isPlaying ? 'text-emerald-600' :
                  isPaused ? 'text-amber-600' :
                  isFinished ? 'text-stone-500' : 'text-stone-500'
                }`}>
                  {isPlaying ? `🔊 ${appConfig.reader.playing}` :
                   isPaused ? `⏸ ${appConfig.reader.paused}` :
                   isFinished ? `✓ ${appConfig.reader.finished}` : `🕐 ${appConfig.reader.ready}`}
                </span>
                <span className="text-stone-500">
                  {totalDisplay > 0 ? `${segIndex} / ${totalDisplay} 문장` : ''}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* 원문 미리보기 */}
            <div className="animate-rise mt-4 rounded-3xl bg-white/75 p-5 backdrop-blur-md max-h-[38vh] overflow-y-auto" style={{ animationDelay: '120ms' }}>
              <p className="text-[13px] leading-relaxed text-stone-700">{confirmedText}</p>
              {isPlaying && currentLine && (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-[12.5px] text-emerald-800">
                  현재 읽는 부분: {currentLine}
                </div>
              )}
            </div>

            {/* 속도 선택 */}
            <div className="animate-rise mt-4 rounded-2xl bg-white/70 px-4 py-3 backdrop-blur-sm" style={{ animationDelay: '150ms' }}>
              <p className="text-[12px] font-semibold text-stone-500 mb-2 flex items-center gap-1">
                <Volume2 className="h-4 w-4 text-emerald-600" strokeWidth={2.2} />
                {appConfig.reader.speedLabel}
              </p>
              <div className="flex gap-2">
                {SPEED_NAMES.map((name, i) => (
                  <button
                    key={name}
                    onClick={() => handleSpeedChange(i)}
                    className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold transition ${
                      speedIdx === i
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 본문 재생 제어 */}
            <div className="animate-rise mt-5 space-y-3" style={{ animationDelay: '180ms' }}>
              {!isPlaying && !isPaused && (
                <button onClick={handlePlay} className="btn-primary w-full">
                  <Play className="h-5 w-5 fill-current" strokeWidth={2.4} />
                  {appConfig.reader.play}
                </button>
              )}

              {isPlaying && (
                <button onClick={handlePause} className="btn-primary w-full !from-amber-400 !to-amber-500">
                  <Pause className="h-5 w-5 fill-current" strokeWidth={2.4} />
                  {appConfig.reader.pause}
                </button>
              )}

              {isPaused && (
                <button onClick={handleResume} className="btn-primary w-full">
                  <Play className="h-5 w-5 fill-current" strokeWidth={2.4} />
                  {appConfig.reader.resume}
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleReset} className="btn-soft">
                  <RotateCcw className="h-4.5 w-4.5 text-stone-500" strokeWidth={2.2} />
                  처음으로
                </button>
                <button onClick={handleNewInput} className="btn-soft">
                  <FileText className="h-4.5 w-4.5 text-stone-500" strokeWidth={2.2} />
                  {appConfig.reader.newInput}
                </button>
              </div>

              {(isPlaying || isPaused) && segTotal > 0 && (
                <div className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-2.5 text-[12px] text-stone-600">
                  <button onClick={() => seekTo(Math.max(0, segIndex - 1))} className="flex items-center gap-1 font-semibold text-emerald-700">
                    <SkipBack className="h-4 w-4" /> 이전 문장
                  </button>
                  <button onClick={() => ttsStop()} className="flex items-center gap-1 font-semibold text-stone-500">
                    <Square className="h-3.5 w-3.5 fill-current" /> 정지
                  </button>
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-[11.5px] text-stone-400">
              화면을 꺼도 잠금화면에서 계속 읽어드립니다
            </p>
          </>
        )}

      </div>
    </div>
  )
}
