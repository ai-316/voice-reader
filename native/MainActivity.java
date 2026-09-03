package __PACKAGE__;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * 말씀 읽어주기 — 네이티브 다리.
 * WebView 안의 JavaScript가 window.TtsNativeBridge 를 통해
 * 백그라운드 TTS 서비스(TtsForeService)와 바로 통신합니다.
 */
public class MainActivity extends BridgeActivity {

    private static final String PREFS = "reader_prefs";
    private static final String KEY_TEXT = "last_text";
    private static final String KEY_RATE = "last_rate";

    private TtsForeService service;
    private boolean bound = false;
    private WebView bridgeWebView;

    private final ServiceConnection conn = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder service) {
            MainActivity.this.service = ((TtsForeService.LocalBinder) service).getService();
            bound = true;
            pushState();
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            MainActivity.this.service = null;
            bound = false;
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 서비스와 연결합니다 (실행 중이면 그대로, 아니면 생성)
        Intent i = new Intent(this, TtsForeService.class);
        startService(i);
        bindService(i, conn, Context.BIND_AUTO_CREATE);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        attachJavascriptBridge();
        pushState();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (bound) unbindService(conn);
    }

    /** WebView에 window.TtsNativeBridge 를 추가합니다 */
    private void attachJavascriptBridge() {
        WebView w = getBridge() != null ? getBridge().getWebView() : null;
        if (w == null || w == bridgeWebView) return;
        bridgeWebView = w;
        w.addJavascriptInterface(new Bridge(), "TtsNativeBridge");
    }

    /** 서비스 → 웹 상태 전달 (알림의 상태 변화 브로드캐스트 대신 직접 JS 호출) */
    private void pushState() {
        runOnUiThread(() -> {
            if (bridgeWebView == null || service == null) return;
            String json = service.statusJson();
            String encoded = android.util.Base64.encodeToString(
                    json.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    android.util.Base64.NO_WRAP
            );
            String js = "window.__ttsOnStatus&&window.__ttsOnStatus(atob(\"" + encoded + "\"));";
            bridgeWebView.evaluateJavascript(js, null);
        });
    }

    // ---- WebView 안 JS와 연동되는 객체 ----
    class Bridge {
        @JavascriptInterface
        public String start(String text, float rate) {
            Intent i = new Intent(MainActivity.this, TtsForeService.class);
            i.setAction(TtsForeService.ACTION_START);
            i.putExtra("text", text);
            i.putExtra("rate", rate);
            startService(i);
            savePrefs(text, rate);
            pushLater();
            return "started";
        }
        @JavascriptInterface public String pause()  { send(TtsForeService.ACTION_PAUSE); pushLater(); return "ok"; }
        @JavascriptInterface public String resume() { send(TtsForeService.ACTION_RESUME); pushLater(); return "ok"; }
        @JavascriptInterface public String stop()   { send(TtsForeService.ACTION_STOP); pushLater(); return "ok"; }
        @JavascriptInterface public String seekTo(int index) {
            Intent i = new Intent(MainActivity.this, TtsForeService.class);
            i.setAction(TtsForeService.ACTION_SEEK);
            i.putExtra("index", index);
            startService(i);
            pushLater();
            return "ok";
        }
        @JavascriptInterface public String setRate(float rate) {
            Intent i = new Intent(MainActivity.this, TtsForeService.class);
            i.setAction(TtsForeService.ACTION_RATE);
            i.putExtra("rate", rate);
            startService(i);
            savePrefs(getLastText(), rate);
            pushLater();
            return "ok";
        }
        @JavascriptInterface public String status() { return service != null ? service.statusJson() : "{}"; }
        @JavascriptInterface public String savedText() { return getLastText(); }
        @JavascriptInterface public float savedRate() { return getLastRate(); }

        private void send(String action) {
            Intent i = new Intent(MainActivity.this, TtsForeService.class);
            i.setAction(action);
            startService(i);
        }
        private void pushLater() {
            new android.os.Handler(android.os.Looper.getMainLooper())
                    .postDelayed(MainActivity.this::pushState, 120);
        }
    }

    private String getLastText() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_TEXT, "");
    }
    private float getLastRate() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getFloat(KEY_RATE, 1.0f);
    }
    private void savePrefs(String text, float rate) {
        SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
        e.putString(KEY_TEXT, text);
        e.putFloat(KEY_RATE, rate);
        e.apply();
    }
}
