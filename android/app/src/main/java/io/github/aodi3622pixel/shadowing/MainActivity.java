package io.github.aodi3622pixel.shadowing;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Insets;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 应用外壳：用 WebView 打开 docs/ 里的网页版跟读器（构建时打包进 assets，包括美式英语录音）。
 * 页面从 https://appassets.androidplatform.net 这个本地地址加载，不联网；
 * index.html 返回前在 <head> 里插入 android-bridge.js（保持亮屏、系统栏留白）。
 */
public final class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private static final String BRIDGE_TAG = "<script src=\"android-bridge.js\"></script>";
    private static final Pattern HEAD = Pattern.compile("<head[^>]*>", Pattern.CASE_INSENSITIVE);

    private FrameLayout root;
    private WebView web;
    private volatile float insetTop, insetBottom;    // CSS px

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.page_bg));
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.page_bg));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        drawBehindSystemBars();

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);   // 电脑 Chrome 打开 chrome://inspect 可调试
        }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                       // 阅读进度存在 localStorage
        s.setMediaPlaybackRequiresUserGesture(false);       // 跟读时一句接一句自动播放
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);                                 // 不叠加系统字体缩放，保持排版
        web.addJavascriptInterface(new Shell(), "AndroidShell");
        web.setWebViewClient(new Client());
        web.loadUrl(HOME);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();                     // 页面收到 visibilitychange，自己停止跟读
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void eval(String js) {
        if (web != null) web.evaluateJavascript(js, null);
    }

    /* ================= 全屏与系统栏 ================= */

    /** 页面画到状态栏和导航栏后面，上下留白交给页面的 --safe-t / --safe-b。 */
    private void drawBehindSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            View d = w.getDecorView();
            d.setSystemUiVisibility(d.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int l, t, r, b;
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    l = i.left; t = i.top; r = i.right; b = i.bottom;
                } else {
                    l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                    r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
                    DisplayCutout c = Build.VERSION.SDK_INT >= 28 ? insets.getDisplayCutout() : null;
                    if (c != null) {
                        l = Math.max(l, c.getSafeInsetLeft()); t = Math.max(t, c.getSafeInsetTop());
                        r = Math.max(r, c.getSafeInsetRight()); b = Math.max(b, c.getSafeInsetBottom());
                    }
                }
                v.setPadding(l, 0, r, 0);                   // 左右（横屏刘海、侧边导航栏）直接让开
                float density = getResources().getDisplayMetrics().density;
                insetTop = t / density;
                insetBottom = b / density;
                pushInsets();
                return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
            }
        });
    }

    private void pushInsets() {
        eval("window.__androidInsets&&__androidInsets(" + insetTop + "," + insetBottom + ")");
    }

    /* ================= 给 android-bridge.js 用的接口（JavaBridge 线程） ================= */

    private final class Shell {
        @JavascriptInterface
        public String getInsets() {
            return "{\"top\":" + insetTop + ",\"bottom\":" + insetBottom + "}";
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    /* ================= 本地网页 ================= */

    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            return HOST.equals(u.getHost()) ? serve(u.getPath()) : null;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, u));   // 外部链接交给浏览器
            } catch (ActivityNotFoundException ignored) { }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            pushInsets();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // 网页进程崩溃或被系统回收：重建界面，而不是整个应用闪退（进度在 localStorage 里）
            root.removeView(view);
            view.destroy();
            if (view == web) web = null;
            recreate();
            return true;
        }
    }

    private WebResourceResponse serve(String path) {
        String name = path == null || path.length() <= 1 ? "index.html" : path.substring(1);
        try {
            InputStream in = getAssets().open(name);
            if (name.equals("index.html")) in = withBridge(in);
            String type = mimeType(name);
            return new WebResourceResponse(type, type.startsWith("text/") || type.endsWith("json") ? "utf-8" : null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static InputStream withBridge(InputStream in) throws IOException {
        String html = new String(readAll(in), StandardCharsets.UTF_8);
        Matcher m = HEAD.matcher(html);
        html = m.find() ? html.substring(0, m.end()) + "\n" + BRIDGE_TAG + html.substring(m.end()) : BRIDGE_TAG + html;
        return new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream src = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = src.read(buf)) != -1; ) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static String mimeType(String name) {
        switch (name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)) {
            case "html": return "text/html";
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "svg": return "image/svg+xml";
            case "mp3": return "audio/mpeg";
            default: return "application/octet-stream";
        }
    }
}
