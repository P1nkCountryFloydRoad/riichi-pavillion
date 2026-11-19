/* 启动入口 */
(function () {
  'use strict';
  const MJ = window.MJ;
  MJ.Settings.init();
  MJ.Records.init();
  MJ.UI.init();
  MJ.Tutorial.init();
  // 通过 http(s) 访问时注册 Service Worker，之后断网也能打开；直接双击 index.html 本身就是离线的
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
