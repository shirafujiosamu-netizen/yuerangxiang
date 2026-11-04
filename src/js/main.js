/* 入口：读档 → 离线补算 → 启动 tick 循环 → 自动存档 */
(function () {
  var DG = window.DG;
  var AUTOSAVE_EVERY = 5; /* 秒 */

  var state = DG.store.load();
  state = state ? DG.state.migrate(state) : DG.state.createInitial();

  DG.ui.init(state);
  DG.ui.renderAll();

  /* 离线补算（50% 效率、封顶 2 小时），超过 1 分钟才弹窗 */
  var offline = DG.state.applyOffline(state, Date.now());
  if (offline.seconds > 60) DG.ui.modalOffline(offline);

  var tickCount = 0;
  setInterval(function () {
    var now = Date.now();
    var r = DG.state.tick(state, 1, now);
    if (r.breach) {
      var ev = DG.pollution.resolveFailure(state, now, Math.random);
      if (ev && ev.ok) DG.ui.modalFailure(ev);
    }
    DG.ui.renderHud();
    if (DG.ui.view === 'compartment') DG.ui.renderCompartment();
    DG.ui.checkIdle(now);
    tickCount++;
    if (tickCount % AUTOSAVE_EVERY === 0) DG.store.save(state);
  }, 1000);

  window.addEventListener('beforeunload', function () { DG.store.save(state); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') DG.store.save(state);
  });
})();
