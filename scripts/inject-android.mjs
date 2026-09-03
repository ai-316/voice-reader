/**
 * 말씀 읽어주기 — 안드로이드 프로젝트에 네이티브 TTS 코드를 자동 삽입합니다.
 * native/ 폼의 파일들을 Capacitor 가 생성한 android 프로젝트로 복사·등록합니다.
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
const PKG = cfg.appId
const pkgDir = PKG.split('.').join('/')

const ANDROID = 'android/app/src/main'
const MANIFEST = `${ANDROID}/AndroidManifest.xml`

if (!existsSync(MANIFEST)) {
  console.error('❌ android 프로젝트가 없습니다. npx cap add android 먼저 실행하세요.')
  process.exit(1)
}

const JAVA_FILES = ['TtsForeService.java', 'SentenceSplitter.java', 'MainActivity.java']
for (const f of JAVA_FILES) {
  const src = readFileSync(`native/${f}`, 'utf8')
  const out = `${ANDROID}/java/${pkgDir}/${f}`
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, src.replace(/__PACKAGE__/g, PKG), 'utf8')
  console.log(`✅ ${f} 복사`)
}

cpSync('native/res', `${ANDROID}/res`, { recursive: true })
console.log('✅ 리소스 복사 완료')

let m = readFileSync(MANIFEST, 'utf8')

// 권한 추가
const PERMS = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.WAKE_LOCK',
]
const missing = PERMS.filter(p => !m.includes(p))
if (missing.length > 0) {
  const block = missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n') + '\n\n'
  m = m.replace(/<manifest[^>]*>/, (match) => `${match}\n${block}`)
  console.log(`✅ 권한 ${missing.length}개 추가`)
} else console.log('ℹ️  권한 이미 등록됨')

// 서비스 등록
function beforeCloseApp(xml, block) {
  const i = xml.lastIndexOf('</application>')
  if (i === -1) { console.error('❌ 매니페스트 형식 이상'); process.exit(1) }
  return xml.slice(0, i) + block + '    ' + xml.slice(i)
}

if (!m.includes('TtsForeService')) {
  const block = `
        <service
            android:name=".TtsForeService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
`
  m = beforeCloseApp(m, block)
  console.log('✅ TTS 서비스 등록 완료')
} else console.log('ℹ️  서비스 이미 등록됨')

writeFileSync(MANIFEST, m, 'utf8')
console.log('🎉 네이티브 TTS 삽입 완료')
