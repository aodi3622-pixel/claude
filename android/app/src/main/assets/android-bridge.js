/* Android 外壳的桥接脚本：MainActivity 把它插在 index.html 的 <head> 最前面，
   把状态栏、导航栏高度写进页面的 --safe-t / --safe-b。 */
(function () {
  'use strict';
  var A = window.AndroidShell;
  if (!A) return;
  window.AndroidApp = {};

  var root = document.documentElement;
  window.__androidInsets = function (top, bottom) {
    root.style.setProperty('--safe-t', top + 'px');
    root.style.setProperty('--safe-b', bottom + 'px');
  };
  try { var ins = JSON.parse(A.getInsets()); window.__androidInsets(ins.top, ins.bottom); } catch (e) {}
})();
