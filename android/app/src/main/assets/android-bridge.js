/* Android 外壳的桥接脚本：MainActivity 把它插在 index.html 的 <head> 最前面。
   1. navigator.wakeLock 改成原生的保持亮屏；
   2. 状态栏、导航栏高度写进页面的 --safe-t / --safe-b。 */
(function () {
  'use strict';
  var A = window.AndroidShell;
  if (!A) return;
  window.AndroidApp = {};

  /* ================= 保持亮屏 ================= */
  var locks = [];
  function WakeLockSentinel() {
    this.type = 'screen'; this.released = false; this.onrelease = null;
    Object.defineProperty(this, '_ls', { value: [] });
  }
  WakeLockSentinel.prototype.addEventListener = function (type, fn) { if (type === 'release') this._ls.push(fn); };
  WakeLockSentinel.prototype.removeEventListener = function (type, fn) { var i = this._ls.indexOf(fn); if (i >= 0) this._ls.splice(i, 1); };
  WakeLockSentinel.prototype.release = function () {
    var i = locks.indexOf(this);
    if (i >= 0) {
      locks.splice(i, 1);
      this.released = true;
      if (!locks.length) A.keepScreenOn(false);
      var self = this, ev = { type: 'release', target: this };
      [this.onrelease].concat(this._ls).forEach(function (fn) { if (typeof fn === 'function') fn.call(self, ev); });
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
})();
