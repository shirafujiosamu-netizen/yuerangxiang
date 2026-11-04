/* 骰宝 + 百家乐 + 事件系统 UI 真实浏览器测试（CDP + Edge headless，file:// 直开）
 * 全部走真实 DOM 点击（.click() 冒泡到 document 委托）：
 * 覆盖页签切换 / 投注区渲染 / 下注累计 / 投掷开牌 / 结算入账 / 资源不足 / demo 档 /
 * 事件弹窗渲染 / 选项后果 / 截图。
 * 运行：先后台起 Edge（remote-debugging-port 9229），再 node src/tests/cdp_sicbo_baccarat.js
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

  /* ============ 骰宝 ============ */
  await ev(`document.querySelector('.nav-btn[data-view="casino"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  await ev(`document.querySelector('.game-tab[data-id="sicbo"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const sbView = await ev(`(function(){
    return {game:DG.ui.casino.game, active:document.querySelector('.game-tab.active').textContent,
      odds:document.querySelector('.odds-note').textContent,
      areas:document.querySelectorAll('.sb-area').length,
      wide:document.querySelectorAll('.sb-area.wide').length,
      nums:document.querySelectorAll('.sb-area.num').length,
      triples:document.querySelectorAll('.sb-area.triple').length,
      diceNone:document.querySelectorAll('.sb-die.none').length,
      rollDisabled:document.querySelector('[data-act="sb-roll"]').disabled,
      chips:[10,50,100].map(v=>!!document.querySelector('.chip-btn[data-id="'+v+'"]')).every(Boolean)};})()`);
  chk('切到骰宝：tab 激活 + 规则文案（206:1 / 1.6%）', sbView.game === 'sicbo' && /骰宝/.test(sbView.active)
    && /206:1/.test(sbView.odds) && /1.6%/.test(sbView.odds), JSON.stringify(sbView).slice(0, 160));
  chk('注区 39 个（2 大小 + 14 点数 + 17 单/对/围/组合）', sbView.areas === 39 && sbView.wide === 2 && sbView.nums === 14 && sbView.triples === 6,
    JSON.stringify({ areas: sbView.areas, wide: sbView.wide, nums: sbView.nums, triples: sbView.triples }));
  chk('未投掷时三骰为占位 + 投掷禁用 + 三档筹码在位',
    sbView.diceNone === 3 && sbView.rollDisabled === true && sbView.chips === true, JSON.stringify(sbView));

  /* 选档 + 筹码 + 下两注 */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="desc"]').click()`);
  await ev(`document.querySelector('.chip-btn[data-id="10"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  await ev(`document.querySelector('.sb-area[data-id="big"]').click()`);
  await ev(`document.querySelector('.sb-area[data-id="total:9"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const sbBet = await ev(`(function(){
    return {staked:DG.ui.sbStaked(), big:DG.ui.casino.sb.bets['big'], t9:DG.ui.casino.sb.bets['total:9'],
      badges:document.querySelectorAll('.sb-area .chip-badge').length};})()`);
  chk('下注累计 20 + 筹码徽标 ×2', sbBet.staked === 20 && sbBet.big === 10 && sbBet.t9 === 10 && sbBet.badges === 2,
    JSON.stringify(sbBet));

  /* 投掷：完整记账 */
  const sb1 = await ev(`(function(){
    var before=DG.ui.game.desc;
    document.querySelector('[data-act="sb-roll"]').click();
    var st=DG.ui.casino.sb; var roll=st.roll;
    var exp=DG.sicbo.settle([{id:'big',stake:10},{id:'total:9',stake:10}], roll);
    var rs=document.getElementById('casino-result');
    return {before:before, after:DG.ui.game.desc, net:exp.net, total:roll.total, d:roll.d.join(''),
      diceLive:document.querySelectorAll('.sb-die:not(.none)').length,
      resultTxt:rs.textContent, resultCls:rs.className, resultColor:getComputedStyle(rs).color,
      hudDesc:document.getElementById('hud-desc').textContent,
      log:DG.ui.casinoLog.length, rounds:DG.ui.game.stats.rounds,
      stakedAfter:DG.ui.sbStaked(), hist:DG.ui.casino.sb.history.length};})()`);
  chk('开局扣 20 且按内核公式入账', sb1.after === sb1.before - 20 + sb1.net, sb1.after + '/net=' + sb1.net);
  chk('三骰落袋渲染（非占位）', sb1.diceLive === 3, sb1.diceLive);
  chk('结果文案含点数与净额', /（\d+ 点）/.test(sb1.resultTxt) && sb1.resultTxt.indexOf('描述') >= 0, sb1.resultTxt);
  chk('结果配色（胜绿 / 负粉）', sb1.resultColor === (sb1.net > 0 ? 'rgb(74, 122, 90)' : 'rgb(247, 118, 142)'), sb1.resultColor);
  chk('HUD 同步', sb1.hudDesc === String(Math.floor(sb1.after)), sb1.hudDesc);
  chk('赌局记录 +1、局数 +1、注已清、历史 +1',
    sb1.log >= 1 && sb1.rounds >= 1 && sb1.stakedAfter === 0 && sb1.hist === 1,
    JSON.stringify({ log: sb1.log, rounds: sb1.rounds, staked: sb1.stakedAfter, hist: sb1.hist }));
  await ev(`(function(){var el=document.querySelector('.sb-wrap'); if(el) el.scrollIntoView({block:'start'}); return true;})()`);
  await shot('sb_table.png');
  chk('截图 sb_table.png 已存', fs.existsSync(T + 'sb_table.png'));

  /* 未下注拒局：按钮禁用 + 历史不变（disabled 按钮 click 不派发，状态行保留上局文案） */
  await ev(`document.querySelector('[data-act="sb-roll"]').click()`);
  const sbNo = await ev(`(function(){
    return {disabled:document.querySelector('[data-act="sb-roll"]').disabled,
      hist:DG.ui.casino.sb.history.length, rounds:DG.ui.game.stats.rounds};})()`);
  chk('未下注时投掷钮禁用 + 历史与局数不变', sbNo.disabled === true && sbNo.hist === 1 && sbNo.rounds === 1,
    JSON.stringify(sbNo));
  await ev(`DG.ui.game.desc = 5`);
  await ev(`document.querySelector('.sb-area[data-id="big"]').click()`);
  const sbPoor = await ev(`(function(){
    return {desc:DG.ui.game.desc, staked:DG.ui.sbStaked()};})()`);
  chk('描述不足拒绝下注', sbPoor.desc === 5 && sbPoor.staked === 0, JSON.stringify(sbPoor));

  /* demo 档 */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="being"]').click()`);
  await ev(`document.querySelector('.sb-area[data-id="big"]').click()`);
  await ev(`document.querySelector('[data-act="sb-roll"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const sbDemo = await ev(`(function(){
    var rs=document.getElementById('casino-result');
    return {desc:DG.ui.game.desc, txt:rs.textContent};})()`);
  chk('存在档 demo：不结算资源', sbDemo.desc === 500 && /demo/.test(sbDemo.txt), sbDemo.txt);

  /* ============ 百家乐 ============ */
  await ev(`document.querySelector('.game-tab[data-id="baccarat"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const bcView = await ev(`(function(){
    return {game:DG.ui.casino.game, active:document.querySelector('.game-tab.active').textContent,
      odds:document.querySelector('.odds-note').textContent,
      bets:document.querySelectorAll('.bc-bet').length,
      holes:document.querySelectorAll('.bj-card.hole').length,
      dealDisabled:document.querySelector('[data-act="bc-deal"]').disabled};})()`);
  chk('切到百家乐：tab 激活 + 规则文案（1.06% / 8 副靴）', bcView.game === 'baccarat' && /百家乐/.test(bcView.active)
    && /1.06%/.test(bcView.odds) && /8 副靴/.test(bcView.odds), JSON.stringify(bcView).slice(0, 160));
  chk('三注区（闲/庄/和）+ 未开牌 4 暗牌 + 开牌禁用', bcView.bets === 3 && bcView.holes === 4 && bcView.dealDisabled === true,
    JSON.stringify(bcView));

  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="desc"]').click()`);
  await ev(`document.querySelector('.chip-btn[data-id="10"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  await ev(`document.querySelector('.bc-bet.player').click()`);
  await ev(`document.querySelector('.bc-bet.banker').click()`);
  await new Promise(r => setTimeout(r, 200));
  const bcBet = await ev(`(function(){
    return {staked:DG.ui.bcStaked(), p:DG.ui.casino.bc.bets.player, b:DG.ui.casino.bc.bets.banker,
      badges:document.querySelectorAll('.bc-bet .chip-badge').length};})()`);
  chk('押闲 + 押庄累计 20 + 徽标 ×2', bcBet.staked === 20 && bcBet.p === 10 && bcBet.b === 10 && bcBet.badges === 2,
    JSON.stringify(bcBet));

  const bc1 = await ev(`(function(){
    var before=DG.ui.game.desc;
    document.querySelector('[data-act="bc-deal"]').click();
    var r=DG.ui.casino.bc.round;
    var exp=DG.baccarat.settleBets([{bet:'player',stake:10},{bet:'banker',stake:10}], r.outcome);
    var rs=document.getElementById('casino-result');
    return {before:before, after:DG.ui.game.desc, net:exp.net, outcome:r.outcome,
      p:r.pTotal, b:r.bTotal, pCards:r.player.length, bCards:r.banker.length,
      liveCards:document.querySelectorAll('.bc-hand .bj-card:not(.hole)').length,
      resultTxt:rs.textContent, resultCls:rs.className,
      hudDesc:document.getElementById('hud-desc').textContent,
      log:DG.ui.casinoLog.length, rounds:DG.ui.game.stats.rounds,
      beads:document.querySelectorAll('.bc-bead').length, shoe:DG.ui.casino.bc.shoe.length};})()`);
  chk('开局扣 20 且按内核公式入账', bc1.after === bc1.before - 20 + bc1.net, bc1.after + '/net=' + bc1.net);
  chk('开牌：双方 2-3 张实牌 + 比分文案', bc1.liveCards === bc1.pCards + bc1.bCards && bc1.liveCards >= 4
    && bc1.resultTxt.indexOf('闲 ' + bc1.p + ' : ' + bc1.b + ' 庄') >= 0,
    JSON.stringify({ live: bc1.liveCards, p: bc1.p, b: bc1.b, txt: bc1.resultTxt }));
  chk('HUD 同步', bc1.hudDesc === String(Math.floor(bc1.after)), bc1.hudDesc);
  chk('赌局记录 +1、局数 +1、路单 +1、shoe 已建立',
    bc1.log >= 1 && bc1.rounds >= 1 && bc1.beads === 1 && bc1.shoe > 300,
    JSON.stringify({ log: bc1.log, rounds: bc1.rounds, beads: bc1.beads, shoe: bc1.shoe }));
  await ev(`(function(){var el=document.querySelector('.bc-wrap'); if(el) el.scrollIntoView({block:'start'}); return true;})()`);
  await shot('bc_table.png');
  chk('截图 bc_table.png 已存', fs.existsSync(T + 'bc_table.png'));

  /* 连开 2 局：shoe 连续消费 */
  const bc2 = await ev(`(function(){
    DG.ui.game.desc = 500;
    document.querySelector('.bc-bet.banker').click();
    document.querySelector('[data-act="bc-deal"]').click();
    var s1=DG.ui.casino.bc.shoe.length;
    document.querySelector('.bc-bet.player').click();
    document.querySelector('[data-act="bc-deal"]').click();
    var s2=DG.ui.casino.bc.shoe.length;
    return {s1:s1, s2:s2, hist:DG.ui.casino.bc.history.length};})()`);
  chk('连开 2 局：shoe 连续减少、历史 3', bc2.s2 < bc2.s1 && bc2.hist === 3,
    JSON.stringify(bc2));

  /* demo 档 */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="being"]').click()`);
  await ev(`document.querySelector('.bc-bet.player').click()`);
  await ev(`document.querySelector('[data-act="bc-deal"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const bcDemo = await ev(`(function(){
    var rs=document.getElementById('casino-result');
    return {desc:DG.ui.game.desc, txt:rs.textContent};})()`);
  chk('存在档 demo：可开牌但不结算资源', bcDemo.desc === 500 && /demo/.test(bcDemo.txt), bcDemo.txt);

  /* ============ 事件系统 ============ */
  /* 推进局数越过间隔，反复调 afterRound 直到事件弹出（概率 22%/次） */
  const evTrig = await ev(`(function(){
    DG.ui.game.stats.rounds = 100;
    DG.ui.game.lastEventRound = 0;
    DG.ui.game.lastEventIds = [];
    for (var i = 0; i < 80 && !DG.ui.casino.event; i++) DG.ui.afterRound();
    var ev = DG.ui.casino.event;
    if (!ev) return {fired:false};
    var root = document.getElementById('modal-root');
    return {fired:true, id:ev.id, type:ev.type,
      title:root.innerHTML.indexOf(ev.title) >= 0,
      choices:(root.innerHTML.match(/event-choice/g)||[]).length};})()`);
  chk('事件可触发并弹出（含标题与选项按钮）', evTrig.fired === true && evTrig.title === true && evTrig.choices >= 2,
    JSON.stringify(evTrig));
  /* 弹窗打开状态下先截图 */
  await ev(`(function(){var el=document.querySelector('.modal-box'); if(el) el.scrollIntoView({block:'center'}); return true;})()`);
  await shot('event_modal.png');
  chk('截图 event_modal.png 已存', fs.existsSync(T + 'event_modal.png'));

  const evChoice = await ev(`(function(){
    var ev = DG.ui.casino.event;
    var descBefore = DG.ui.game.desc, moodBefore = DG.ui.game.mood, bondsBefore = (DG.ui.game.bonds||{}).eidos||0;
    var btns = document.querySelectorAll('[data-act="event-choice"]');
    btns[0].click();
    var root = document.getElementById('modal-root');
    return {id:ev.id, descDelta:DG.ui.game.desc - descBefore, moodDelta:DG.ui.game.mood - moodBefore,
      bondsDelta:((DG.ui.game.bonds||{}).eidos||0) - bondsBefore,
      closed:root.innerHTML === '', log:DG.ui.casinoLog.length};})()`);
  chk('选项 0 生效：弹窗关闭 + 赌局记录 +1', evChoice.closed === true && evChoice.log >= 1,
    JSON.stringify(evChoice));
  chk('选项后果写回资源/关系（desc/mood/bonds 任一变化，或纯叙事/清理类）',
    evChoice.descDelta !== 0 || evChoice.moodDelta !== 0 || evChoice.bondsDelta !== 0
    || ['cheater', 'bum_debt', 'midnight'].indexOf(evChoice.id) >= 0,
    JSON.stringify(evChoice));

  /* 收尾：恢复 + 回归断言 */
  const fin = await ev(`(function(){
    return {tabs:document.querySelectorAll('.game-tab').length,
      errors:window.__errs||0};})()`);
  chk('五个游戏页签齐全', fin.tabs === 5, fin.tabs);
  chk('全程无 JS 错误', errs.length === 0, errs[0]);

  console.log('\n========================================');
  results.forEach(r => console.log('  ' + r));
  console.log('========================================');
  console.log('骰宝+百家乐+事件 CDP：' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
