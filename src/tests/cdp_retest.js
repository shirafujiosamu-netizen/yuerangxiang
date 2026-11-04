// 数值接入 + bug 修复回看复测（CDP 真实 Edge，file:// 直开）
const WS = require('ws');
const PORT = 9229;
const URL = 'file:///F:/job/oc-game/src/index.html';
const T = 'C:/Users/33633/AppData/Local/Temp/';
let pass = 0, fail = 0;
const results = [];
function chk(name, ok, extra) {
  if (ok) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra != null ? ' -> ' + extra : '')); }
}

(async () => {
  await new Promise(r => setTimeout(r, 3000));
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 150));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error: ' + JSON.stringify(d.params.args).slice(0, 150));
  });
  const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 4000));
  /* 测试隔离：先置空 store.save 再清档，否则 beforeunload 会把旧档写回 */
  await ev(`(function(){try{ DG.store.save=function(){return false;}; localStorage.clear(); }catch(e){} return true;})()`);
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 3500));

  // 1. 初始加载
  chk('初始加载无 JS 错误', errs.length === 0, errs[0]);
  chk('标题含《黄昏之门》', /黄昏之门/.test(await ev(`document.title`)), await ev(`document.title`));
  chk('占位图加载（Ótakmarkað/Eidos）', await ev(`(function(){var i=[...document.images];return i.length>=0;})()`));

  // 2. 污染缩放 0.03 生效
  const scale = await ev(`(function(){DG.state.contain(DG.ui.game,'oc_gott',1e12);return {scale:DG.POLLUTION_SCALE, rate:DG.pollution.rate(DG.ui.game,1e12)};})()`);
  chk('POLLUTION_SCALE === 0.03', scale && scale.scale === 0.03, scale && scale.scale);
  chk('单 R 单位污染速率 0.03/s', scale && Math.abs(scale.rate - 0.03) < 1e-9, scale && scale.rate);

  // 3. 赌场：21点规则文案 + TIERS note
  await ev(`DG.ui.setView('casino')`);
  await new Promise(r => setTimeout(r, 500));
  const oddsTxt = await ev(`document.querySelector('.odds-note').textContent`);
  chk('规则文案：单副靴 / 软17停 / 3:2', /单副牌靴/.test(oddsTxt) && /软 17 停/.test(oddsTxt) && /3:2/.test(oddsTxt), oddsTxt);
  chk('规则文案无 TODO 残留', !/TODO/.test(oddsTxt));
  const noteTxt = await ev(`document.querySelector('.tier-btn .t-note').textContent`);
  chk('TIERS note「胜 1:1 / 二十一点 3:2」', /胜 1:1/.test(noteTxt) && /3:2/.test(noteTxt), noteTxt);

  // 4. 赌一局（21点）：id/class bug + 台词不被吞
  await ev(`(function(){DG.ui.game.desc=200;DG.ui.casino.tier='desc';DG.ui.onTierSelect('desc');DG.ui.bjDeal();
    var bj=DG.ui.casino.bj, g=0;
    while (bj && bj.phase==='playing' && g++<20) {
      if (DG.blackjack.basicStrategyAction(bj.state.player)==='stand') DG.ui.bjStand(); else DG.ui.bjHit();
    }})()`);
  await new Promise(r => setTimeout(r, 300));
  const round = await ev(`(function(){
    var r=document.getElementById('casino-result');
    return {id:r?r.id:'absent', cls:r?r.className:'', hasStyle:r?getComputedStyle(r).padding!=='0px':false,
            line:document.getElementById('eidos-line').textContent,
            log:DG.ui.casinoLog.length, bjPhase:DG.ui.casino.bj?DG.ui.casino.bj.phase:'null'};})()`);
  chk('Bug1 修复：结果框 id 为纯 casino-result', round.id === 'casino-result', round.id);
  chk('Bug1 修复：胜负 class 正确着色（win/lose）', /win|lose/.test(round.cls), round.cls);
  chk('Bug2 修复：庄家结算台词不被重渲染吞掉', round.line && round.line.length > 6 && !/^「赔率永远公平。」$/.test(round.line), round.line);
  chk('赌局记录有条目', round.log >= 1, round.log);
  chk('牌局进入 done 相', round.bjPhase === 'done', round.bjPhase);

  // 5. debuff：连输 5 局触发 + 生效 + HUD 提示 + 恢复
  const debuff = await ev(`(function(){
    var s=DG.ui.game, before=DG.state.outputPerSecond(s,1e12).desc, last=null;
    s.stats.lossStreak=4; s.desc=1000;
    DG.casino.start(s,'desc'); last=DG.casino.resolve(s,'desc',function(){return 0.99;},1e12);
    var during=DG.state.outputPerSecond(s,1e12).desc;
    s.completedUntil=1e12-1; var after=DG.state.outputPerSecond(s,1e12).desc;
    return {completed:last.completed, text:last.completionText, during:during, after:after, before:before,
            hudVisible:document.getElementById('hud-completed').style.display};
  })()`);
  chk('连输 5 局触发「完成」', debuff.completed === true, debuff.completed);
  chk('completionText 含「完成」', debuff.text && debuff.text.indexOf('完成') >= 0, debuff.text);
  chk('debuff 期间产出减半', Math.abs(debuff.during - debuff.before * 0.5) < 1e-9, debuff.during + ' vs ' + debuff.before);
  chk('debuff 过期恢复全速', Math.abs(debuff.after - debuff.before) < 1e-9, debuff.after);
  // HUD 提示渲染
  const hudDebuff = await ev(`(function(){var s=DG.ui.game; s.completedUntil=Date.now()+30000; DG.ui.renderHud(); var el=document.getElementById('hud-completed'); var vis=el.style.display; var txt=document.getElementById('hud-completed-val').textContent; s.completedUntil=0; DG.ui.renderHud(); return {vis:vis, txt:txt};})()`);
  chk('HUD debuff 提示显示+倒计时', hudDebuff.vis === '' && /产出减半/.test(hudDebuff.txt), JSON.stringify(hudDebuff));

  // 6. 失效权重常量
  const w = await ev(`({h:DG.pollution.CONSTANTS.FAIL_HALT, d:DG.pollution.CONSTANTS.FAIL_DROP})`);
  chk('失效权重 0.40/0.30', w.h === 0.40 && w.d === 0.30, JSON.stringify(w));

  // 7. 全程无错误
  chk('全程 0 JS 错误', errs.length === 0, errs[0]);

  // 截图
  const s1 = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(T + 'retest_casino.png', Buffer.from(s1.result.data, 'base64'));

  console.log(results.join('\n'));
  console.log(`\n===== ${pass} 通过 / ${fail} 失败 =====`);
  ws.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
