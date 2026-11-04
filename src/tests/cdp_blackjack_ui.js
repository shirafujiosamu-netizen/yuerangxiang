/* 二十一点 UI 真实浏览器测试（CDP + Edge headless，file:// 直开）
 * 与 cdp_retest.js 的区别：全部走真实 DOM 点击（.click() 冒泡到 document 委托），
 * 覆盖发牌渲染 / 暗牌 / 要牌停牌 / 加倍 / 结算着色 / 台词 / 记录 / debuff HUD。
 * 运行：先后台起 Edge（remote-debugging-port 9229），再 node src/tests/cdp_blackjack_ui.js
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
  /* 测试隔离：file:// 域 localStorage 跨次泄漏存档。须先置空 store.save，
   * 否则跳转时 beforeunload 会把旧档写回（clear 被覆盖，第二页加载到带单位的旧档，
   * tick 持续产出导致 desc 漂移）。 */
  await ev(`(function(){try{ DG.store.save=function(){return false;}; localStorage.clear(); }catch(e){} return true;})()`);
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 3500));
  /* 精确记账：置空 tick（挂机产出会让 desc 漂移，赌局断言要精确到个位数） */
  await ev(`(function(){try{ DG.state.tick=function(){return {breach:false};}; }catch(e){} return true;})()`);

  chk('初始加载无 JS 错误', errs.length === 0, errs[0]);
  chk('标题含《黄昏之门》', /黄昏之门/.test(await ev(`document.title`)), await ev(`document.title`));

  /* 1. 切赌场视图（真实点击导航） */
  await ev(`document.querySelector('.nav-btn[data-view="casino"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const tabs = await ev(`(function(){var t=[...document.querySelectorAll('.game-tab')].map(e=>e.textContent);
    return {tabs:t, active:document.querySelector('.game-tab.active')?document.querySelector('.game-tab.active').textContent:'',
            odds:document.querySelector('.odds-note').textContent, idle:!!document.querySelector('.bj-idle'),
            dealDisabled:document.querySelector('[data-act="bj-deal"]').disabled};})()`);
  chk('游戏 tabs：21点 / 轮盘 / 老虎机 / 骰宝 / 百家乐', tabs.tabs.length === 5 && /二十一点/.test(tabs.tabs[0]) && /轮盘/.test(tabs.tabs[1]) && /老虎机/.test(tabs.tabs[2]) && /骰宝/.test(tabs.tabs[3]) && /百家乐/.test(tabs.tabs[4]), JSON.stringify(tabs.tabs));
  chk('21点 tab 为 active', /二十一点/.test(tabs.active), tabs.active);
  chk('规则说明（单副靴 / S17 / 3:2）', /单副牌靴/.test(tabs.odds) && /软 17 停/.test(tabs.odds) && /3:2/.test(tabs.odds), tabs.odds);
  chk('未选档时开局按钮禁用', tabs.idle === true && tabs.dealDisabled === true, JSON.stringify({ idle: tabs.idle, disabled: tabs.dealDisabled }));

  /* 2. 选档 + 开局（真实点击） */
  await ev(`DG.ui.game.desc = 500`);
  await ev(`document.querySelector('.tier-btn[data-id="desc"]').click()`);
  await new Promise(r => setTimeout(r, 200));
  const sel = await ev(`(function(){return {tier:DG.ui.casino.tier, sel:document.querySelector('.tier-btn[data-id="desc"]').className.indexOf('selected')>=0, dealOn:!document.querySelector('[data-act="bj-deal"]').disabled};})()`);
  chk('点击选中描述档（高亮 + 开局解禁）', sel.tier === 'desc' && sel.sel && sel.dealOn, JSON.stringify(sel));

  await ev(`document.querySelector('[data-act="bj-deal"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const deal = await ev(`(function(){
    var bj=DG.ui.casino.bj;
    return {phase:bj?bj.phase:'null', bet:bj?bj.state.bet:0, desc:DG.ui.game.desc,
            cards:document.querySelectorAll('.bj-card').length,
            hole:document.querySelectorAll('.bj-card.hole').length,
            openingBJ:bj?!!bj.state.openingBlackjack:false,
            hudDesc:document.getElementById('hud-desc').textContent,
            zones:document.querySelectorAll('.bj-zone').length};})()`);
  var expectDesc = 490 + (deal.openingBJ ? 15 : 0); /* 极点开局庄家摊牌后直结：-10 +15 */
  chk('开局扣 10 描述（极点开局已直结则 505）', deal.desc === expectDesc, deal.desc + ' expect ' + expectDesc);
  chk('开局后 HUD 同步', deal.hudDesc === String(expectDesc), deal.hudDesc + ' expect ' + expectDesc);
  chk('开局发牌渲染（≥4 张牌）', deal.cards >= 4, deal.cards);
  chk('开局注为 10', deal.bet === 10, deal.bet);
  chk('牌桌分庄/你两个区', deal.zones === 2, deal.zones);
  if (deal.phase === 'playing') {
    chk('playing：庄家暗牌 1 张', deal.hole === 1, deal.hole);
    chk('playing：要牌/停牌/加倍按钮在场', await ev(`(function(){return !!document.querySelector('[data-act="bj-hit"]') && !!document.querySelector('[data-act="bj-stand"]') && !!document.querySelector('[data-act="bj-double"]') && !document.querySelector('[data-act="bj-double"]').disabled;})()`));
    await ev(`window.scrollTo(0, Math.max(0, (document.querySelector('.bj-table')||{offsetTop:0}).offsetTop - 60))`);
    await new Promise(r => setTimeout(r, 200));
    await shot('bj_playing.png');
    chk('截图 bj_playing.png 已存', fs.existsSync(T + 'bj_playing.png'));
  }

  /* 3. 打完整局（真实点击，基本策略驱动） */
  const played = await ev(`(async function(){
    var clicks=0;
    while (DG.ui.casino.bj && DG.ui.casino.bj.phase==='playing' && clicks<20) {
      var act=DG.blackjack.basicStrategyAction(DG.ui.casino.bj.state.player);
      var btn=document.querySelector('[data-act="'+(act==='stand'?'bj-stand':'bj-hit')+'"]');
      if(!btn) break;
      btn.click(); clicks++;
      await new Promise(r=>setTimeout(r,60));
    }
    var bj=DG.ui.casino.bj;
    var rs=document.getElementById('casino-result');
    return {clicks:clicks, phase:bj.phase, outcome:bj.state.outcome, delta:bj.state.delta,
            holeLeft:document.querySelectorAll('.bj-card.hole').length,
            revealed:!bj.state.holeHidden, stood:bj.state.stood,
            resultCls:rs?rs.className:'', resultTxt:rs?rs.textContent:'',
            resultColor:rs?getComputedStyle(rs).color:'',
            again:!!document.querySelector('[data-act="bj-deal"]'),
            line:document.getElementById('eidos-line').textContent,
            log:DG.ui.casinoLog.length, logTxt:DG.ui.casinoLog[0]?DG.ui.casinoLog[0].text:'',
            desc:DG.ui.game.desc, wins:DG.ui.game.stats.wins, streak:DG.ui.game.stats.lossStreak};})()`);
  chk('对局可打到结束（done）', played.phase === 'done', played.phase);
  chk('暗牌渲染与内核一致（revealed↔无 hole）', played.holeLeft === (played.revealed ? 0 : 1), 'hole=' + played.holeLeft + ' revealed=' + played.revealed);
  chk('未摊牌仅见于爆牌负局（真实规则：爆牌庄家不摊）', played.revealed || played.outcome === 'lose', played.outcome);
  chk('结果框文案非空', played.resultTxt.length > 0, played.resultTxt);
  const expectCls = played.outcome === 'lose' ? 'lose' : (played.outcome === 'push' ? '' : 'win');
  chk('结果框 class 随胜负（' + played.outcome + ' → ' + expectCls + '）', played.resultCls === expectCls, played.resultCls);
  const expectColor = played.outcome === 'lose' ? 'rgb(247, 118, 142)' : (played.outcome === 'push' ? '' : 'rgb(74, 122, 90)');
  chk('结果框配色随胜负', expectColor === '' || played.resultColor === expectColor, played.resultColor + ' expect ' + expectColor);
  chk('「再来一局」按钮出现', played.again === true);
  chk('赌局记录有条目', played.log >= 1, played.log);
  chk('记录文本含注数与结果', /押 10/.test(played.logTxt) && new RegExp(played.outcome).test(played.logTxt), played.logTxt);
  chk('庄家结算台词（非默认句）', played.line.length > 6 && played.line !== '「赔率永远公平。」', played.line);
  chk('结算写回资源：desc = 490 + delta', played.desc === 490 + played.delta, played.desc + ' vs ' + (490 + played.delta));
  chk('统计：胜/连败与结果一致', (played.delta > 0 && played.wins >= 1 && played.streak === 0) || (played.delta < 0 && played.streak >= 1) || played.delta === 0, JSON.stringify({ w: played.wins, s: played.streak }));
  await shot('bj_done.png');
  chk('截图 bj_done.png 已存', fs.existsSync(T + 'bj_done.png'));
  /* 滚动到牌桌再截一张（Eidos 立绘栏较高，牌桌可能位于首屏下） */
  await ev(`window.scrollTo(0, Math.max(0, (document.querySelector('.bj-table')||{offsetTop:0}).offsetTop - 60))`);
  await new Promise(r => setTimeout(r, 300));
  await shot('bj_table.png');
  chk('截图 bj_table.png 已存', fs.existsSync(T + 'bj_table.png'));
  const tableBox = await ev(`(function(){var t=document.querySelector('.bj-table'); var r=t.getBoundingClientRect(); return {top:Math.round(r.top), left:Math.round(r.left), w:Math.round(r.width), h:Math.round(r.height)};})()`);
  chk('牌桌位于视口内（滚动后）', tableBox.top >= 0 && tableBox.top < 800 && tableBox.w > 400, JSON.stringify(tableBox));

  /* 4. 加倍（真实点击）：重开至拿到非极点局 */
  const dbl = await ev(`(async function(){
    DG.ui.game.desc = 500;
    var bj=null, guard=0;
    do {
      document.querySelector('[data-act="bj-deal"]').click();
      bj=DG.ui.casino.bj;
      if (bj.phase==='playing') break;
      DG.ui.game.desc = 500;
    } while (guard++ < 8);
    if (!bj || bj.phase!=='playing') return {skip:true};
    var before=DG.ui.game.desc;
    document.querySelector('[data-act="bj-double"]').click();
    await new Promise(r=>setTimeout(r,120));
    var rs=document.getElementById('casino-result');
    return {skip:false, before:before, after:DG.ui.game.desc, bet:bj.state.bet, doubled:bj.state.doubled,
            delta:bj.state.delta, phase:bj.phase, cards:bj.state.player.length,
            doubledTag:document.body.innerHTML.indexOf('已加倍')>=0,
            resultTxt:rs?rs.textContent:''};})()`);
  if (dbl.skip) chk('加倍路径：拿到可操作局', false, '8 连极点（不应发生）');
  else {
    chk('加倍：注 10→20 且标「已加倍」', dbl.bet === 20 && dbl.doubled === true && dbl.doubledTag, JSON.stringify({ bet: dbl.bet, doubled: dbl.doubled, tag: dbl.doubledTag }));
    chk('加倍：再扣 10 后按 delta 结算', dbl.after === dbl.before - 10 + dbl.delta, dbl.after + ' vs ' + (dbl.before - 10 + dbl.delta));
    chk('加倍：一张牌即结算（done，3 张手牌）', dbl.phase === 'done' && dbl.cards === 3, dbl.phase + '/' + dbl.cards);
    chk('加倍结果文案非空', dbl.resultTxt.length > 0, dbl.resultTxt);
  }

  /* 5. 资源不足时开局被拒（真实点击） */
  const poor = await ev(`(function(){
    DG.ui.game.desc = 5;
    document.querySelector('[data-act="bj-deal"]').click();
    return {desc:DG.ui.game.desc, notice:document.getElementById('notice')?document.getElementById('notice').textContent:'',
            phase:DG.ui.casino.bj.phase};})()`);
  chk('描述不足开局被拒 + 提示', poor.desc === 5 && /描述不足/.test(poor.notice), JSON.stringify(poor));

  /* 6. debuff HUD（真实 renderHud） */
  const hud = await ev(`(function(){var s=DG.ui.game; s.completedUntil=Date.now()+30000; DG.ui.renderHud();
    var vis=document.getElementById('hud-completed').style.display;
    var txt=document.getElementById('hud-completed-val').textContent;
    s.completedUntil=0; DG.ui.renderHud();
    return {vis:vis, txt:txt, hiddenAfter:document.getElementById('hud-completed').style.display};})()`);
  chk('debuff HUD：显示 + 倒计时文案', hud.vis === '' && /产出减半（剩余 \d+s）/.test(hud.txt), JSON.stringify(hud));
  chk('debuff 消退后 HUD 隐藏', hud.hiddenAfter === 'none', hud.hiddenAfter);

  /* 7. 全程无错误 */
  chk('全程 0 JS 错误', errs.length === 0, errs[0]);

  console.log(results.join('\n'));
  console.log(`\n===== ${pass} 通过 / ${fail} 失败 =====`);
  ws.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
