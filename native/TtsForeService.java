package __PACKAGE__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.List;
import java.util.Locale;

/**
 * 백그라운드에서도 글을 계속 읽어주는 핵심 서비스.
 * 화면을 끄거나 잠금 상태가 되어도 읽기가 계속됩니다.
 */
public class TtsForeService extends Service {

    public static final String ACTION_START = "__PACKAGE__.TTS_START";
    public static final String ACTION_PAUSE = "__PACKAGE__.TTS_PAUSE";
    public static final String ACTION_RESUME = "__PACKAGE__.TTS_RESUME";
    public static final String ACTION_STOP = "__PACKAGE__.TTS_STOP";
    public static final String ACTION_SEEK = "__PACKAGE__.TTS_SEEK";
    public static final String ACTION_RATE = "__PACKAGE__.TTS_RATE";
    public static final String ACTION_BROADCAST = "__PACKAGE__.TTS_STATE_CHANGED";

    private static final String CHANNEL_ID = "tts_reader_v1";
    private static final int NOTI_ID = 7701;

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // 재생 상태
    private static volatile StateHolder state = new StateHolder();

    public static class StateHolder {
        public volatile String fullText = "";
        public volatile List<String> segments = java.util.Collections.emptyList();
        public volatile int index = 0;
        public volatile String status = "idle";   // idle / speaking / paused / finished
        public volatile float rate = 1.0f;
    }

    private final IBinder binder = new LocalBinder();
    public class LocalBinder extends Binder {
        public TtsForeService getService() { return TtsForeService.this; }
    }

    @Override public IBinder onBind(Intent intent) { return binder; }

    @Override
    public void onCreate() {
        super.onCreate();
        initTts();
        createNotificationChannel();
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            ttsReady = (status == TextToSpeech.SUCCESS);
            if (ttsReady) {
                int result = tts.setLanguage(Locale.KOREAN);
                tts.setSpeechRate(state.rate);
                tts.setPitch(1.0f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {
                        mainHandler.post(() -> broadcastState());
                    }
                    @Override public void onDone(String utteranceId) {
                        // 다음 문장으로 이동
                        mainHandler.post(TtsForeService.this::onSegmentDone);
                    }
                    @Override public void onError(String utteranceId) {
                        mainHandler.post(TtsForeService.this::onSegmentDone);
                    }
                });
            }
        });
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "말씀 읽어주기", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("글을 소리 내어 읽어주는 중입니다");
            ch.enableVibration(false);
            ch.setSound(null, null);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // ---------------- 엔진에서 명령 처리 ----------------

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        String action = intent.getAction() == null ? "" : intent.getAction();

        switch (action) {
            case ACTION_START: {
                String text = intent.getStringExtra("text");
                float rate = intent.getFloatExtra("rate", 1.0f);
                startReading(text, rate);
                break;
            }
            case ACTION_PAUSE:  pauseReading();  break;
            case ACTION_RESUME: resumeReading(); break;
            case ACTION_STOP:   stopReading();   break;
            case ACTION_SEEK: {
                int idx = intent.getIntExtra("index", 0);
                seekTo(idx);
                break;
            }
            case ACTION_RATE: {
                float newRate = intent.getFloatExtra("rate", 1.0f);
                changeRate(newRate);
                break;
            }
        }
        return START_STICKY;
    }

    // ---------------- 재생 로직 ----------------

    public void startReading(String text, float rate) {
        if (text == null) text = "";
        state.fullText = text;
        state.segments = SentenceSplitter.split(text);
        state.index = 0;
        state.rate = Math.max(0.5f, Math.min(2.0f, rate));
        state.status = "speaking";
        if (ttsReady && tts != null) tts.setSpeechRate(state.rate);
        startForeground(NOTI_ID, buildNotification("읽고 있습니다…"));
        broadcastState();
        speakCurrent();
    }

    public void pauseReading() {
        if (!"speaking".equals(state.status)) return;
        state.status = "paused";
        if (tts != null) tts.stop();
        updateNotification("일시정지됨 — 눌러서 계속 들으세요");
        broadcastState();
    }

    public void resumeReading() {
        if (!"paused".equals(state.status)) return;
        state.status = "speaking";
        updateNotification("읽고 있습니다…");
        broadcastState();
        speakCurrent();
    }

    public void stopReading() {
        state.status = "idle";
        if (tts != null) tts.stop();
        state.index = 0;
        stopForeground(true);
        stopSelf();
        broadcastState();
    }

    public void seekTo(int idx) {
        if (state.segments.isEmpty()) return;
        state.index = Math.max(0, Math.min(state.segments.size() - 1, idx));
        if ("speaking".equals(state.status)) {
            if (tts != null) tts.stop();
            speakCurrent();
        }
        state.status = "speaking".equals(state.status) ? "speaking" : state.status;
        updateNotification("읽고 있습니다…");
        broadcastState();
    }

    public void changeRate(float newRate) {
        state.rate = Math.max(0.5f, Math.min(2.0f, newRate));
        if (ttsReady && tts != null) tts.setSpeechRate(state.rate);
        // 재생 중이라면 현재 문장을 새 속도로 다시 읽습니다
        if ("speaking".equals(state.status)) {
            if (tts != null) tts.stop();
            speakCurrent();
        }
        broadcastState();
    }

    private void speakCurrent() {
        if (!"speaking".equals(state.status)) return;
        if (state.index >= state.segments.size()) {
            onFinished();
            return;
        }
        if (!ttsReady || tts == null) return;

        String current = state.segments.get(state.index);
        // 너무 길면(약 200자 이상) 다시 나눕니다
        if (current.length() > 220) {
            // 이미 SentenceSplitter에서 나눴지만, 혹시 모를 경우를 위해
            current = current.substring(0, 220);
        }

        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "piece_" + state.index);
        tts.speak(current, TextToSpeech.QUEUE_FLUSH, params, "piece_" + state.index);
    }

    private void onSegmentDone() {
        if (!"speaking".equals(state.status)) return;
        state.index++;
        broadcastState();
        if (state.index >= state.segments.size()) {
            onFinished();
        } else {
            speakCurrent();
        }
    }

    private void onFinished() {
        state.status = "finished";
        if (tts != null) tts.stop();
        updateNotification("다 읽었습니다 — 처음부터 다시 들을 수 있어요");
        broadcastState();
        stopSelf();
        // 서비스는 끊지만, 완료 상태는 유지 (앱에서 상태 읽기용)
    }

    // ---------------- WebView ↔ 서비스 통신 ----------------

    private void broadcastState() {
        Intent b = new Intent(ACTION_BROADCAST);
        b.putExtra("state", toJson());
        sendBroadcast(b);
    }

    /** WebView에서 상태를 읽기 위한 별칭(남길 규칙과 호환) */
    public String statusJson() {
        return toJson();
    }

    public String toJson() {
        String current = (state.segments.isEmpty() || state.index >= state.segments.size())
                ? "" : state.segments.get(state.index);
        int total = state.segments.size();
        return "{"
                + "\"state\":\"" + state.status + "\","
                + "\"index\":" + state.index + ","
                + "\"total\":" + total + ","
                + "\"currentText\":\"" + escapeJson(current) + "\","
                + "\"rate\":" + state.rate
                + "}";
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    // ---------------- 알림 ----------------

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTI_ID, buildNotification(text));
    }

    private Notification buildNotification(String content) {
        // 앱을 열어보는 인텐트
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                this, 10, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        b.setSmallIcon(R.drawable.ic_tts_notification)
         .setContentTitle("말씀 읽어주기")
         .setContentText(content)
         .setContentIntent(openPending)
         .setOngoing("speaking".equals(state.status));

        // 재생 중이면 "일시정지/정지" 버튼, 멈춰있으면 "이어읽기/정지"
        int req = 20;
        if ("speaking".equals(state.status)) {
            b.addAction(buildAction(this, ACTION_PAUSE, "일시정지", req++));
        } else if ("paused".equals(state.status)) {
            b.addAction(buildAction(this, ACTION_RESUME, "이어읽기", req++));
        }
        b.addAction(buildAction(this, ACTION_STOP, "정지", req++));

        return b.build();
    }

    private static Notification.Action buildAction(Context ctx, String action, String title, int requestCode) {
        Intent intent = new Intent(ctx, TtsForeService.class);
        intent.setAction(action);
        PendingIntent pending = PendingIntent.getService(
                ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        @SuppressWarnings("deprecation")
        Notification.Action.Builder ab = new Notification.Action.Builder(null, title, pending);
        return ab.build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}
