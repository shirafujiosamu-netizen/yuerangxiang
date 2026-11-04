/* 轮盘 + 老虎机 UI 真实浏览器测试（CDP + Edge headless，file:// 直开）
 * 全部走真实 DOM 点击（.click() 冒泡到 document 委托）：
 * 覆盖页签切换 / 投注桌渲染 / 筹码累计 / 旋转落袋 / 结算入账 / 配色 / 记录 / 截图。
 * 运行：先后台起 Edge（remote-debugging-port 9229），再 node src/tests/cdp_casino_games.js
 */
const WS = require('ws');
const fs = require('fs');
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
  if (!page) { console.error('FATAL: 无 page 目标，Edge 未起来？'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); const errs = [];
  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error: ' + JSON.stringify(d.params.args).slice(0, 200));
  });
  const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(T + name, Buffer.from(s.result.data, 'base64')); };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 4000));
  /* 测试隔离：先置空 store.save 再 clear，防 beforeunload 写回旧档 */
  await ev(`(function(){try{ DG.store.save=function(){return false;}; localStorage.clear(); }catch(e){} return true;})()`);
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 3500));
  /* 精确记账：置空 tick */
  await ev(`(function(){try{ DG.state.tick=function(){return {breach:false};}; }catch(e){} return true;})()`);

  chk('初始加载无 JS 错误', errs.length === 0, errs[0]);

  /* ============ 轮盘 ============ */
  await ev(`document.querySelector('.nav-btn[data-view="casino"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  await ev(`document.querySelector('.game-tab[data-id="roulette"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const rlView = await ev(`(function(){
    return {game:DG.ui.casino.game, active:document.querySelector('.game-tab.active').textContent,
      odds:document.querySelector('.odds-note').textContent,
      cells:document.querySelectorAll('.rl-cell').length, outs:document.querySelectorAll('.rl-out').length,
      zeroGreen:document.querySelector('.rl-cell[data-id="straight:0"]').className.indexOf('green')>=0,
      hasDozen:!!document.querySelector('[data-id="dozen:2"]'), hasCol:!!document.querySelector('[data-id="col:3"]'),
      hasRed:!!document.querySelector('.rl-out[data-id="red"]'), spinDisabled:document.querySelector('[data-act="rl-spin"]').disabled,
      chips:[10,50,100].map(v=>!!document.querySelector('.chip-btn[data-id="'+v+'"]')).every(Boolean)};})()`);
  chk('切到轮盘：tab 激活 + 规则文案（单零/35:1/2.70%）', rlView.game === 'roulette' && /轮盘/.test(rlView.active)
    && /欧式单零轮盘/.test(rlView.odds) && /35:1/.test(rlView.odds) && /2.70%/.test(rlView.odds), JSON.stringify(rlView).slice(0, 160));
  chk('投注桌：37 个号码格 + 12 个外围/打数/列', rlView.cells === 37 && rlView.outs === 12, JSON.stringify({ cells: rlView.cells, outs: rlView.outs }));
  chk('0 号格为绿色', rlView.zeroGreen === true);
  chk('打数/列/红黑注区齐全', rlView.hasDozen && rlView.hasCol && rlView.hasRed);
  chk('未下注时旋转禁用 + 三档筹码在位', rlView.spinDisabled === true && rlView.chips === true);

  /* 选档 + 选筹码 + 下两注 */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="desc"]').click()`);
  await ev(`document.querySelector('.chip-btn[data-id="100"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  await ev(`document.querySelector('.rl-cell[data-id="straight:17"]').click()`);
  await ev(`document.querySelector('.rl-out[data-id="red"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const bets = await ev(`(function(){
    return {staked:DG.ui.rlStaked(), badges:document.querySelectorAll('.chip-badge').length,
      badgeTxt:[...document.querySelectorAll('.chip-badge')].map(e=>e.textContent).join(','),
      stakedTxt:document.querySelector('.rl-staked').textContent,
      spinOn:!document.querySelector('[data-act="rl-spin"]').disabled,
      status:document.getElementById('casino-status').textContent};})()`);
  chk('下注累计 200（17 号 100 + 红 100）', bets.staked === 200, bets.staked);
  chk('注区显示 2 枚筹码徽标（各 100）', bets.badges === 2 && bets.badgeTxt === '100,100', JSON.stringify(bets));
  chk('已押金额文案 + 旋转解禁', /已押 200/.test(bets.stakedTxt) && bets.spinOn === true, JSON.stringify(bets));

  /* 旋转（真实点击） */
  const spin = await ev(`(function(){
    var before=DG.ui.game.desc;
    document.querySelector('[data-act="rl-spin"]').click();
    var pocket=DG.ui.casino.rl.pocket;
    var exp=DG.roulette.settleBets([{id:'straight:17',stake:100},{id:'red',stake:100}],pocket);
    var rs=document.getElementById('casino-result');
    return {before:before, after:DG.ui.game.desc, pocket:pocket, expNet:exp.net, expRet:exp.returned,
      pocketCls:document.querySelector('.rl-pocket').className, pocketTxt:document.querySelector('.rl-pocket').textContent,
      hist:document.querySelectorAll('.rl-hp').length,
      resultCls:rs.className, resultTxt:rs.textContent,
      resultColor:getComputedStyle(rs).color,
      hudDesc:document.getElementById('hud-desc').textContent,
      log:DG.ui.casinoLog.length, logTxt:DG.ui.casinoLog[0]?DG.ui.casinoLog[0].text:'',
      rounds:DG.ui.game.stats.rounds,
      line:document.getElementById('eidos-line').textContent};})()`);
  chk('落袋 0-36（渲染号码与颜色类）', spin.pocket >= 0 && spin.pocket <= 36
    && spin.pocketTxt === String(spin.pocket)
    && spin.pocketCls.indexOf(DG_color_name(spin.pocket)) >= 0, JSON.stringify(spin).slice(0, 200));
  chk('历史条 +1', spin.hist === 1, spin.hist);
  chk('结算写回资源：desc = 500 - 200 + net', spin.after === spin.before - 200 + spin.expNet, spin.after + ' vs ' + (spin.before - 200 + spin.expNet));
  chk('HUD 同步', spin.hudDesc === String(Math.floor(spin.after)), spin.hudDesc);
  const expectRlCls = spin.expNet > 0 ? 'win' : 'lose';
  chk('结果框 class 随胜负（' + expectRlCls + '）', spin.resultCls === expectRlCls, spin.resultCls);
  const expectRlColor = spin.expNet > 0 ? 'rgb(74, 122, 90)' : 'rgb(247, 118, 142)';
  chk('结果框配色随胜负', spin.resultColor === expectRlColor, spin.resultColor + ' expect ' + expectRlColor);
  chk('结果文案含落袋号码', spin.resultTxt.indexOf('落袋 ' + spin.pocket) >= 0, spin.resultTxt);
  chk('赌局记录 +1（含押注与净额）', spin.log === 1 && /轮盘/.test(spin.logTxt) && new RegExp((spin.expNet >= 0 ? '\\+' : '-') + Math.abs(spin.expNet)).test(spin.logTxt), spin.logTxt);
  chk('局数 +1', spin.rounds === 1, spin.rounds);
  chk('庄家台词非默认', spin.line.length > 6 && spin.line !== '「赔率永远公平。」', spin.line);
  /* 截图（滚动到投注桌） */
  await ev(`window.scrollTo(0, Math.max(0, (document.querySelector('.rl-grid')||{offsetTop:0}).offsetTop - 60))`);
  await new Promise(r => setTimeout(r, 300));
  await shot('rl_table.png');
  chk('截图 rl_table.png 已存', fs.existsSync(T + 'rl_table.png'));

  /* 清空 + 资源不足拒局（按钮禁用 + 状态行说明原因） */
  const poor = await ev(`(function(){
    document.querySelector('[data-act="rl-clear"]').click();
    DG.ui.game.desc = 50;
    document.querySelector('.rl-out[data-id="red"]').click();   /* 筹码 100 > 50 */
    var beforeHist=DG.ui.casino.rl.history.length;
    var statusTxt=document.getElementById('casino-status').textContent;
    var spinDisabled=document.querySelector('[data-act="rl-spin"]').disabled;
    if(!spinDisabled) document.querySelector('[data-act="rl-spin"]').click();
    return {desc:DG.ui.game.desc, hist:beforeHist, histAfter:DG.ui.casino.rl.history.length,
      status:statusTxt, spinDisabled:spinDisabled};})()`);
  chk('描述不足：旋转禁用 + 状态行说明（资源不动 + 不加历史）', poor.desc === 50 && poor.histAfter === poor.hist
    && poor.spinDisabled === true && /描述不足/.test(poor.status), JSON.stringify(poor).slice(0, 220));

  /* demo 档（存在） */
  const demo = await ev(`(function(){
    document.querySelector('[data-act="rl-clear"]').click();
    document.querySelector('.tier-btn[data-id="being"]').click();
    document.querySelector('.rl-cell[data-id="straight:0"]').click();
    DG.ui.game.desc = 500;
    document.querySelector('[data-act="rl-spin"]').click();
    var rs=document.getElementById('casino-result');
    return {desc:DG.ui.game.desc, txt:rs.textContent, pocket:DG.ui.casino.rl.pocket};})()`);
  chk('存在档 demo：可旋转、资源不动、文案标注', demo.desc === 500 && /demo/.test(demo.txt), JSON.stringify(demo).slice(0, 160));

  /* ============ 老虎机 ============ */
  await ev(`document.querySelector('.game-tab[data-id="slots"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  /* 先选档选筹码，再验视图（否则按钮文案停留在上一档位） */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="desc"]').click()`);
  await ev(`document.querySelector('.chip-btn[data-id="10"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const slView = await ev(`(function(){
    return {game:DG.ui.casino.game, active:document.querySelector('.game-tab.active').textContent,
      odds:document.querySelector('.odds-note').textContent,
      reels:document.querySelectorAll('.sl-reel').length,
      placeholders:[...document.querySelectorAll('.sl-reel')].map(e=>e.textContent).join(''),
      ptRows:document.querySelectorAll('.sl-pt tr').length,
      ptHas400:document.body.innerHTML.indexOf('三连 ×400')>=0,
      ptHas14:document.body.innerHTML.indexOf('成双 ×14')>=0,
      spinBtn:document.querySelector('[data-act="sl-spin"]').textContent};})()`);
  chk('切到老虎机：tab 激活 + 规则文案（96.4%）', slView.game === 'slots' && /老虎机/.test(slView.active) && /96.4%/.test(slView.odds), JSON.stringify(slView).slice(0, 160));
  chk('3 卷轴窗 + 未拉杆时占位 ?', slView.reels === 3 && slView.placeholders === '???', JSON.stringify(slView));
  chk('赔付表 6 行（含 400 倍大奖与 14 倍成双）', slView.ptRows === 6 && slView.ptHas400 && slView.ptHas14, JSON.stringify(slView));
  chk('拉杆按钮带筹码与档位文案', /拉杆（10 描述）/.test(slView.spinBtn), slView.spinBtn);

  /* 拉杆一次：完整记账（计数器取相对值，前段轮盘已有入账） */
  const sl1 = await ev(`(function(){
    var logBefore=DG.ui.casinoLog.length, roundsBefore=DG.ui.game.stats.rounds;
    var before=DG.ui.game.desc;
    document.querySelector('[data-act="sl-spin"]').click();
    var st=DG.ui.casino.sl; var mult=st.history[0].mult;
    var rs=document.getElementById('casino-result');
    return {before:before, after:DG.ui.game.desc, mult:mult,
      reelTxt:[...document.querySelectorAll('.sl-reel')].map(e=>e.textContent).join(''),
      reelNoQ:[...document.querySelectorAll('.sl-reel')].every(e=>e.textContent!=='?'),
      hist:document.querySelectorAll('.sl-hitem').length,
      resultCls:rs.className, resultTxt:rs.textContent, resultColor:getComputedStyle(rs).color,
      hudDesc:document.getElementById('hud-desc').textContent,
      log:DG.ui.casinoLog.length-logBefore, rounds:DG.ui.game.stats.rounds-roundsBefore};})()`);
  chk('拉杆出 3 符（非占位）', sl1.reelNoQ === true && sl1.reelTxt.length >= 3, sl1.reelTxt);
  chk('结算写回资源：desc = 500 - 10 +（胜 10×mult / 负 -10）', sl1.after === sl1.before - 10 + (sl1.mult > 0 ? 10 * sl1.mult : -10),
    sl1.after + '/mult=' + sl1.mult);
  chk('HUD 同步', sl1.hudDesc === String(Math.floor(sl1.after)), sl1.hudDesc);
  chk('结果 class 与倍数一致', sl1.resultCls === (sl1.mult > 0 ? 'win' : 'lose'), sl1.resultCls + '/mult=' + sl1.mult);
  chk('结果配色（胜绿 / 负粉）', sl1.resultColor === (sl1.mult > 0 ? 'rgb(74, 122, 90)' : 'rgb(247, 118, 142)'), sl1.resultColor);
  chk('结果文案非空', sl1.resultTxt.length > 0, sl1.resultTxt);
  chk('历史 +1、赌局记录 +1、局数 +1', sl1.hist === 1 && sl1.log === 1 && sl1.rounds === 1, JSON.stringify({ h: sl1.hist, log: sl1.log, rounds: sl1.rounds }));

  /* 连拉 5 杆：状态机每步自洽 */
  const loop = await ev(`(async function(){
    var out=[];
    for (var i=0;i<5;i++){
      DG.ui.game.desc = 500;
      document.querySelector('[data-act="sl-spin"]').click();
      var st=DG.ui.casino.sl; var mult=st.history[0].mult;
      var rs=document.getElementById('casino-result');
      var okReels=st.reels.length===3;
      var okDesc=DG.ui.game.desc===500-10+(mult>0?10*mult:-10);
      var okCls=rs.className===(mult>0?'win':'lose');
      var okTxt=rs.textContent.length>0;
      out.push({mult:mult, okReels:okReels, okDesc:okDesc, okCls:okCls, okTxt:okTxt});
      await new Promise(r=>setTimeout(r,80));
    }
    return {runs:out, hist:document.querySelectorAll('.sl-hitem').length};})()`);
  chk('连拉 5 杆每步自洽（卷轴/记账/着色/文案）', loop.runs.every(r => r.okReels && r.okDesc && r.okCls && r.okTxt), JSON.stringify(loop).slice(0, 240));
  chk('历史累计 6 条', loop.hist === 6, loop.hist);
  await ev(`window.scrollTo(0, Math.max(0, (document.querySelector('.sl-machine')||{offsetTop:0}).offsetTop - 60))`);
  await new Promise(r => setTimeout(r, 300));
  await shot('sl_machine.png');
  chk('截图 sl_machine.png 已存', fs.existsSync(T + 'sl_machine.png'));

  /* 资源不足拒局 */
  const slPoor = await ev(`(function(){
    DG.ui.game.desc = 5;
    document.querySelector('[data-act="sl-spin"]').click();
    var notice=document.getElementById('notice');
    return {desc:DG.ui.game.desc, hist:DG.ui.casino.sl.history.length, notice:notice?notice.textContent:''};})()`);
  chk('描述不足拉杆被拒（资源不动 + 提示）', slPoor.desc === 5 && slPoor.hist === 6 && /描述不足/.test(slPoor.notice), JSON.stringify(slPoor).slice(0, 160));

  /* 切回二十一点：页签与牌桌渲染（本测试未开局，bj 为 idle 态；保留场景由冒烟覆盖） */
  const back = await ev(`(function(){
    document.querySelector('.game-tab[data-id="bj"]').click();
    return {game:DG.ui.casino.game, bjTable:!!document.querySelector('.bj-table'),
      bjPhase:DG.ui.casino.bj?DG.ui.casino.bj.phase:'null'};})()`);
  chk('切回二十一点：牌桌渲染（本局 idle，状态保留由冒烟覆盖）', back.game === 'bj' && back.bjTable === true, JSON.stringify(back));

  chk('全程 0 JS 错误', errs.length === 0, errs[0]);

  console.log(results.join('\n'));
  console.log(`\n===== ${pass} 通过 / ${fail} 失败 =====`);
  ws.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

/* 落袋号码 → 颜色类名（与 DG.roulette.pocketColor 一致，供断言用） */
function DG_color_name(n) {
  if (n === 0) return 'green';
  var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return RED.indexOf(n) >= 0 ? 'red' : 'black';
}
