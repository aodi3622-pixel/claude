package io.github.aodi3622pixel.shadowing;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.MissingResourceException;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 网页朗读改走系统 TextToSpeech（Android WebView 自带的 speechSynthesis 不出声）。
 * assets/android-bridge.js 把这里包装成标准的 speechSynthesis，网页代码不用为 Android 改。
 * 结果通过 window.__androidTts(id, type, a, b) 回调给网页；引擎状态只在主线程上读写。
 */
final class TtsBridge {

    /** 在当前 WebView 里执行一段 JS（主线程调用）。 */
    interface Sink {
        void eval(String js);
    }

    /** 不列出发音人、只能按语言选的引擎，用这个前缀的假 voiceURI 表示。 */
    private static final String LANG_PREFIX = "lang:";
    private static final Pattern GOOGLE_VOICE = Pattern.compile("-x-([a-z0-9]+)-(?:local|network)$");

    private final Context ctx;
    private final Sink sink;
    private final Handler main = new Handler(Looper.getMainLooper());

    private TextToSpeech tts;
    private int generation;
    private boolean ready, failed;
    private String engine;
    private final List<Request> waiting = new ArrayList<>();
    private final Set<String> active = new HashSet<>();
    private final Map<String, Voice> voicesByName = new HashMap<>();
    private volatile String voicesJson = "[]";

    TtsBridge(Context ctx, Sink sink) {
        this.ctx = ctx;
        this.sink = sink;
        start();
    }

    /* ================= 给网页调用（JavaBridge 线程） ================= */

    @JavascriptInterface
    public String getVoices() {
        return voicesJson;
    }

    @JavascriptInterface
    public void speak(String id, String text, String lang, String voiceUri, float rate, float pitch, float volume) {
        final Request r = new Request(id, text, lang, voiceUri, rate, pitch, volume);
        main.post(new Runnable() {
            @Override public void run() {
                if (ready) say(r);
                else if (failed) emit(r.id, "error", "synthesis-unavailable", null);
                else waiting.add(r);                       // 引擎还在启动，启动好再读
            }
        });
    }

    @JavascriptInterface
    public void stop() {
        main.post(new Runnable() {
            @Override public void run() {
                stopSpeaking();
            }
        });
    }

    /* ================= 给 MainActivity 调用（主线程） ================= */

    void onResume() {
        if (!ready && !failed) return;                     // 还在启动
        if (failed || !TextUtils.equals(tts.getDefaultEngine(), engine)) restart();  // 去设置里换了引擎
        else refreshVoices();                              // 可能刚下载了语音包
    }

    void stopSpeaking() {
        waiting.clear();
        active.clear();
        if (ready) tts.stop();
    }

    void shutdown() {
        generation++;
        ready = false;
        waiting.clear();
        active.clear();
        if (tts != null) {
            try { tts.shutdown(); } catch (RuntimeException ignored) { }
            tts = null;
        }
    }

    /* ================= 引擎 ================= */

    private void start() {
        final int g = ++generation;
        ready = failed = false;
        tts = new TextToSpeech(ctx, new TextToSpeech.OnInitListener() {
            @Override public void onInit(final int status) {
                // 失败时可能在构造函数里同步回调，统一放到主线程排队处理
                main.post(new Runnable() {
                    @Override public void run() {
                        if (g == generation) initDone(status == TextToSpeech.SUCCESS);
                    }
                });
            }
        });
    }

    private void restart() {
        for (String id : active) emit(id, "error", "interrupted", null);
        shutdown();
        start();
    }

    private void initDone(boolean ok) {
        if (!ok) {
            failed = true;
            for (Request r : waiting) emit(r.id, "error", "synthesis-unavailable", null);
            waiting.clear();
            setVoices("[]");
            return;
        }
        engine = tts.getDefaultEngine();
        tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)               // 跟媒体音量走
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        tts.setOnUtteranceProgressListener(new Progress());
        ready = true;
        refreshVoices();
        for (Request r : waiting) say(r);
        waiting.clear();
    }

    private void say(Request r) {
        Voice v = voicesByName.get(r.voiceUri);
        if (v == null || tts.setVoice(v) != TextToSpeech.SUCCESS) {
            String tag = r.voiceUri.startsWith(LANG_PREFIX) ? r.voiceUri.substring(LANG_PREFIX.length())
                    : v != null ? v.getLocale().toLanguageTag() : r.lang;
            tts.setLanguage(tag.isEmpty() ? Locale.US : Locale.forLanguageTag(tag));
        }
        tts.setSpeechRate(r.rate);
        tts.setPitch(r.pitch);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, r.volume);
        active.add(r.id);
        if (tts.speak(r.text, TextToSpeech.QUEUE_ADD, params, r.id) != TextToSpeech.SUCCESS) {
            active.remove(r.id);
            emit(r.id, "error", "synthesis-failed", null);
        }
    }

    /** 播放进度回调在 binder 线程，转回主线程再交给网页。 */
    private final class Progress extends UtteranceProgressListener {
        @Override public void onStart(String id) { post(id, "start", null, null); }
        @Override public void onDone(String id) { post(id, "end", null, null); }
        @Override @Deprecated public void onError(String id) { onError(id, TextToSpeech.ERROR); }
        @Override public void onError(String id, int code) { post(id, "error", errorName(code), null); }
        @Override public void onStop(String id, boolean interrupted) { post(id, "error", interrupted ? "interrupted" : "canceled", null); }
        // Android 8+：正在读的词在原文里的位置，网页用它做逐词高亮
        @Override public void onRangeStart(String id, int start, int end, int frame) { post(id, "boundary", start, end); }

        private void post(final String id, final String type, final Object a, final Object b) {
            main.post(new Runnable() {
                @Override public void run() {
                    if (!type.equals("start") && !type.equals("boundary")) active.remove(id);
                    emit(id, type, a, b);
                }
            });
        }
    }

    private void emit(String id, String type, Object a, Object b) {
        sink.eval("window.__androidTts&&__androidTts(" + JSONObject.quote(id) + "," + JSONObject.quote(type)
                + "," + jsValue(a) + "," + jsValue(b) + ")");
    }

    private static String jsValue(Object o) {
        return o == null ? "null" : o instanceof String ? JSONObject.quote((String) o) : String.valueOf(o);
    }

    // 对应 Web Speech API 的 SpeechSynthesisErrorCode
    private static String errorName(int code) {
        switch (code) {
            case TextToSpeech.ERROR_NETWORK:
            case TextToSpeech.ERROR_NETWORK_TIMEOUT: return "network";
            case TextToSpeech.ERROR_NOT_INSTALLED_YET: return "voice-unavailable";
            case TextToSpeech.ERROR_OUTPUT: return "audio-hardware";
            case TextToSpeech.ERROR_SERVICE: return "synthesis-unavailable";
            case TextToSpeech.ERROR_INVALID_REQUEST: return "invalid-argument";
            default: return "synthesis-failed";
        }
    }

    /* ================= 发音人列表 ================= */

    private void refreshVoices() {
        Voice usDefault = null;
        boolean usAvailable = false;
        try {
            usAvailable = tts.isLanguageAvailable(Locale.US) >= TextToSpeech.LANG_AVAILABLE;
            if (usAvailable && tts.setLanguage(Locale.US) >= TextToSpeech.LANG_AVAILABLE) usDefault = tts.getVoice();
        } catch (RuntimeException ignored) { }

        List<Voice> list = new ArrayList<>();
        Set<Voice> all = null;
        try { all = tts.getVoices(); } catch (RuntimeException ignored) { }
        if (all != null) {
            for (Voice v : all) {
                if (v == null || v.getLocale() == null) continue;
                Set<String> f = v.getFeatures();
                if (f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                list.add(v);
            }
        }
        // 引擎默认的美式英语排第一，然后离线优先、音质高的优先；网页再按语言排序（稳定排序，保留这个次序）
        final Voice preferred = usDefault;
        Collections.sort(list, new Comparator<Voice>() {
            @Override public int compare(Voice a, Voice b) {
                boolean pa = a.equals(preferred), pb = b.equals(preferred);
                if (pa != pb) return pa ? -1 : 1;
                if (a.isNetworkConnectionRequired() != b.isNetworkConnectionRequired()) return a.isNetworkConnectionRequired() ? 1 : -1;
                if (a.getQuality() != b.getQuality()) return b.getQuality() - a.getQuality();
                return a.getName().compareTo(b.getName());
            }
        });

        String label = engineLabel();
        JSONArray out = new JSONArray();
        boolean english = false;
        voicesByName.clear();
        try {
            for (Voice v : list) {
                String lang = languageTag(v.getLocale());
                english |= lang.equals("en") || lang.startsWith("en-");
                voicesByName.put(v.getName(), v);
                out.put(voiceJson(v.getName(), label + " · " + shortName(v), lang, !v.isNetworkConnectionRequired(), v.equals(preferred)));
            }
            // 不少国产手机自带的引擎不列出发音人，但能读英语：补一个按语言选的
            if (!english && usAvailable) out.put(voiceJson(LANG_PREFIX + "en-US", label + " · English", "en-US", true, true));
        } catch (JSONException ignored) { }
        setVoices(out.toString());
    }

    private void setVoices(String json) {
        if (json.equals(voicesJson)) return;
        voicesJson = json;
        emit("", "voiceschanged", null, null);
    }

    private static JSONObject voiceJson(String uri, String name, String lang, boolean local, boolean dflt) throws JSONException {
        return new JSONObject().put("voiceURI", uri).put("name", name).put("lang", lang)
                .put("localService", local).put("default", dflt);
    }

    private String engineLabel() {
        String pkg = tts.getDefaultEngine();
        for (TextToSpeech.EngineInfo e : tts.getEngines()) {
            if (e.name.equals(pkg) && !TextUtils.isEmpty(e.label)) return e.label;
        }
        return pkg == null ? "TTS" : pkg;
    }

    /** Google 的发音人名像 en-us-x-iol-local，取中间的 IOL；其它引擎原样显示。 */
    private static String shortName(Voice v) {
        Matcher m = GOOGLE_VOICE.matcher(v.getName());
        return m.find() ? m.group(1).toUpperCase(Locale.ROOT) : v.getName();
    }

    /** 统一成 en-US 这种写法（有的引擎给的是 eng-USA）。 */
    private static String languageTag(Locale l) {
        String lang = l.getLanguage(), country = l.getCountry();
        if (lang.length() == 3) lang = iso2(lang, true);
        if (country.length() == 3) country = iso2(country, false);
        return country.isEmpty() ? lang : lang + "-" + country;
    }

    private static String iso2(String code3, boolean language) {
        for (String c : language ? Locale.getISOLanguages() : Locale.getISOCountries()) {
            try {
                Locale l = language ? new Locale(c) : new Locale("", c);
                if (code3.equalsIgnoreCase(language ? l.getISO3Language() : l.getISO3Country())) return c;
            } catch (MissingResourceException ignored) { }
        }
        return code3;
    }

    private static final class Request {
        final String id, text, lang, voiceUri;
        final float rate, pitch, volume;

        Request(String id, String text, String lang, String voiceUri, float rate, float pitch, float volume) {
            this.id = id;
            this.text = text == null ? "" : text;
            this.lang = lang == null ? "" : lang;
            this.voiceUri = voiceUri == null ? "" : voiceUri;
            this.rate = rate;
            this.pitch = pitch;
            this.volume = volume;
        }
    }
}
