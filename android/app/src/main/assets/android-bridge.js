/* Android 外壳的桥接脚本：MainActivity 把它插在 index.html 的 <head> 最前面。
   1. Android WebView 里的 speechSynthesis 不出声：换成调用系统 TextToSpeech 的同名实现；
   2. navigator.wakeLock 改成原生的保持亮屏；
   3. 状态栏、导航栏高度写进页面的 --safe-t / --safe-b；
   4. 把 theme-color 和设置面板开合告诉原生（系统栏图标颜色、返回键）。 */
(function () {
  'use strict';
  var T = window.AndroidTTS, A = window.AndroidShell;
  if (!T || !A) return;

  function later(fn) { setTimeout(fn, 0); }
  function on(type, fn) { var a = this._ls[type] || (this._ls[type] = []); if (a.indexOf(fn) < 0) a.push(fn); }
  function off(type, fn) { var a = this._ls[type], i = a ? a.indexOf(fn) : -1; if (i >= 0) a.splice(i, 1); }
  function listeners(obj) { Object.defineProperty(obj, '_ls', { value: {} }); obj.addEventListener = on; obj.removeEventListener = off; return obj; }
  function fire(target, type, ev) {
    ev.type = type; ev.target = ev.currentTarget = target;
    [target['on' + type]].concat(target._ls[type] || []).forEach(function (fn) {
      if (typeof fn !== 'function') return;
      try { fn.call(target, ev); } catch (e) { later(function () { throw e; }); }
    });
  }
  function clamp(v, lo, hi, dflt) { v = Number(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }

  /* ================= speechSynthesis ================= */
  function SpeechSynthesisUtterance(text) {
    this.text = text == null ? '' : String(text);
    this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1;
    this.onstart = this.onend = this.onerror = this.onboundary = this.onpause = this.onresume = this.onmark = null;
    listeners(this);
  }

  var live = {};          // id -> {u, started, t0}：已交给原生、还没结束的句子
  var seq = 0, voices = null;
  var synth = listeners({ pending: false, speaking: false, paused: false, onvoiceschanged: null });

  function sync() {
    var ids = Object.keys(live);
    synth.speaking = ids.length > 0;
    synth.pending = ids.some(function (id) { return !live[id].started; });
  }
  function evt(x, extra) {
    var e = { utterance: x.u, charIndex: 0, charLength: 0, name: '',
              elapsedTime: x.t0 ? (performance.now() - x.t0) / 1000 : 0 };
    for (var k in extra) e[k] = extra[k];
    return e;
  }

  synth.getVoices = function () {
    if (!voices) {
      try { voices = JSON.parse(T.getVoices()); } catch (e) { voices = []; }
    }
    return voices.slice();
  };
  synth.speak = function (u) {
    if (!(u instanceof SpeechSynthesisUtterance)) throw new TypeError("Failed to execute 'speak': parameter 1 is not of type 'SpeechSynthesisUtterance'.");
    var id = 'u' + (++seq);
    live[id] = { u: u, started: false, t0: 0 };
    sync();
    T.speak(id, String(u.text), String(u.lang || ''), (u.voice && u.voice.voiceURI) || '',
            clamp(u.rate, 0.1, 10, 1), clamp(u.pitch, 0, 2, 1), clamp(u.volume, 0, 1, 1));
  };
  synth.cancel = function () {
    var gone = Object.keys(live).map(function (id) { var x = live[id]; delete live[id]; return x; });
    T.stop();
    sync();
    later(function () {
      gone.forEach(function (x) { fire(x.u, 'error', evt(x, { error: x.started ? 'interrupted' : 'canceled' })); });
    });
  };
  synth.pause = function () {};       // 系统 TextToSpeech 不支持暂停
  synth.resume = function () {};

  // 原生回调
  window.__androidTts = function (id, type, a, b) {
    if (type === 'voiceschanged') { voices = null; fire(synth, 'voiceschanged', {}); return; }
    var x = live[id];
    if (!x) return;                    // 已经取消
    if (type === 'start') {
      x.started = true; x.t0 = performance.now(); sync();
      fire(x.u, 'start', evt(x, {}));
    } else if (type === 'boundary') {
      fire(x.u, 'boundary', evt(x, { name: 'word', charIndex: a, charLength: Math.max(0, b - a) }));
    } else if (type === 'end' || type === 'error') {
      delete live[id]; sync();
      fire(x.u, type, evt(x, type === 'error' ? { error: a || 'synthesis-failed' } : { charIndex: x.u.text.length }));
    }
  };

  try {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, enumerable: true, get: function () { return synth; } });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: SpeechSynthesisUtterance });
  } catch (e) {}

  /* ================= 保持亮屏 ================= */
  var locks = [];
  function WakeLockSentinel() { this.type = 'screen'; this.released = false; this.onrelease = null; listeners(this); }
  WakeLockSentinel.prototype.release = function () {
    var i = locks.indexOf(this);
    if (i >= 0) {
      locks.splice(i, 1);
      this.released = true;
      if (!locks.length) A.keepScreenOn(false);
      fire(this, 'release', {});
    }
    return Promise.resolve();
  };
  var wakeLock = {
    request: function (type) {
      if (type && type !== 'screen') return Promise.reject(new TypeError('Unsupported wake lock type: ' + type));
      var s = new WakeLockSentinel();
      locks.push(s);
      if (locks.length === 1) A.keepScreenOn(true);
      return Promise.resolve(s);
    }
  };
  try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, get: function () { return wakeLock; } }); } catch (e) {}
  // 和浏览器一样：页面切到后台时自动释放
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) locks.slice().forEach(function (s) { s.release(); });
  });

  /* ================= 系统栏 ================= */
  var root = document.documentElement;
  window.__androidInsets = function (top, bottom) {
    root.style.setProperty('--safe-t', top + 'px');
    root.style.setProperty('--safe-b', bottom + 'px');
  };
  try { var ins = JSON.parse(A.getInsets()); window.__androidInsets(ins.top, ins.bottom); } catch (e) {}

  function watchPage() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var color = function () { A.setThemeColor(meta.getAttribute('content') || ''); };
      color();
      new MutationObserver(color).observe(meta, { attributes: true, attributeFilter: ['content'] });
    }
    var open = null;
    var sheet = function () {
      var o = document.body.classList.contains('sheet-open');
      if (o !== open) { open = o; A.setSheetOpen(o); }
    };
    sheet();
    new MutationObserver(sheet).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchPage);
  else watchPage();

  window.AndroidApp = { openTtsSettings: function () { A.openTtsSettings(); } };
})();
