/* Node 冒烟测试：用最小 fake-DOM 驱动 ui.js + main.js，
 * 覆盖点击交互路径（导航切换 / 买技能 / 赌局一局 / 收容 / 压制 / 失效弹窗 / 挂机台词）。
 *
 * 注意：fake-DOM 不解析 innerHTML，动态渲染出的元素无法被 querySelector 命中，
 * 因此点击目标由测试手工构造（带 data-act 等属性的元素节点）。
 * 真实浏览器渲染验证见 docs/dev_notes.md（无头 Chrome dump-dom / 截图）。
 *
 * 运行：node src/tests/run_ui_smoke.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- 最小 fake DOM ---------- */
function matches(el, sel) {
  if (sel[0] === '.') return el.classes.has(sel.slice(1));
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel[0] === '[') { var m = sel.match(/^\[([\w-]+)\]$/); return m ? el.attrs[m[1]] != null : false; }
  return el.tagName === sel;
}
class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parent = null;
    this.attrs = {}; this.classes = new Set(); this.style = {};
    this.textContent = ''; this._html = ''; this.id = ''; this.disabled = false;
    this.classList = {
      add: c => this.classes.add(c),
      remove: c => this.classes.delete(c),
      toggle: (c, f) => { if (f === undefined) { this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c); } else { f ? this.classes.add(c) : this.classes.delete(c); } },
      contains: c => this.classes.has(c)
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  addEventListener(type, fn) { (this._l = this._l || {}); (this._l[type] = this._l[type] || []).push(fn); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs.hasOwnProperty(k) ? this.attrs[k] : null; }
  closest(sel) { let el = this; while (el) { if (matches(el, sel)) return el; el = el.parent; } return null; }
}
function walk(el, fn) { if (fn(el)) return true; for (const c of el.children) if (walk(c, fn)) return true; return false; }
function findAll(el, sel, out) { out = out || []; walk(el, e => { if (matches(e, sel)) out.push(e); return false; }); return out; }

const doc = new El('#document');
doc.listeners = {};
doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
doc.getElementById = id => { let hit = null; walk(doc, e => { if (e.id === id) { hit = e; return true; } return false; }); return hit; };
doc.querySelectorAll = sel => findAll(doc, sel);
doc.createElement = tag => new El(tag);
doc.body = new El('body'); doc.appendChild(doc.body);
doc.visibilityState = 'visible';

/* 静态结构（与 index.html 一致） */
const topbar = new El('header'); topbar.id = 'topbar'; doc.body.appendChild(topbar);
const nav = new El('nav'); nav.id = 'nav'; topbar.appendChild(nav);
['business', 'compartment', 'skilltree', 'casino'].forEach(v => {
  const b = new El('button'); b.classes.add('nav-btn'); b.setAttribute('data-view', v); b.textContent = v;
  nav.appendChild(b);
});
const hud = new El('div'); hud.id = 'hud'; topbar.appendChild(hud);
['desc', 'mood'].forEach(k => { const s = new El('span'); s.id = 'hud-' + k; hud.appendChild(s); });
const fill = new El('div'); fill.id = 'pollution-fill'; hud.appendChild(fill);
const poll = new El('span'); poll.id = 'hud-pollution'; hud.appendChild(poll);
/* 「完成」debuff 提示（与 index.html 一致，默认隐藏） */
const hudCompleted = new El('div'); hudCompleted.id = 'hud-completed'; hudCompleted.style.display = 'none'; hud.appendChild(hudCompleted);
const hudCompletedVal = new El('span'); hudCompletedVal.id = 'hud-completed-val'; hudCompleted.appendChild(hudCompletedVal);
const view = new El('main'); view.id = 'view'; doc.body.appendChild(view);
const modalRoot = new El('div'); modalRoot.id = 'modal-root'; doc.body.appendChild(modalRoot);
/* renderXxx 不解析 innerHTML，这两个动态 id 手工预置 */
const otakBubble = new El('div'); otakBubble.id = 'otak-bubble'; doc.body.appendChild(otakBubble);
const eidosLine = new El('div'); eidosLine.id = 'eidos-line'; doc.body.appendChild(eidosLine);

/* ---------- 沙箱 ---------- */
const timers = [];
let intervalFn = null;
const sandbox = {
  console, document: doc,
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => { },
  setInterval: (fn) => { intervalFn = fn; return 1; },
  addEventListener: () => { }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const JS_DIR = path.join(__dirname, '..', 'js');
const bundle = ['data.js', 'core.js', 'state.js', 'pollution.js', 'skilltree.js', 'casino.js', 'blackjack.js', 'roulette.js', 'slots.js', 'sicbo.js', 'baccarat.js', 'events.js', 'house.js', 'archive.js', 'funeral.js', 'ui.js', 'main.js']
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
vm.runInContext(bundle, sandbox, { filename: 'full-bundle.js' });

const DG = sandbox.DG;
let passed = 0, failed = 0;
function t(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n== ' + s + ' =='); }
function click(el) {
  ((el._l && el._l.click) || []).forEach(fn => fn({ target: el }));      /* 元素自身绑定（nav） */
  (doc.listeners.click || []).forEach(fn => fn({ target: el }));        /* document 委托 */
  /* 营业日打烊后牌桌会收起来：冒烟测试里自动替玩家点「开门营业」，模拟跨日 */
  var act = el.getAttribute ? el.getAttribute('data-act') : null;
  if (act !== 'house-open' && DG.house && DG.ui.game && DG.house.isClosed(DG.ui.game)) {
    DG.house.nextDay(DG.ui.game);
    DG.ui.renderCasino();
  }
}
function change(el) { (doc.listeners.change || []).forEach(fn => fn({ target: el })); }
function mkEl(attrs, cls) {
  const e = new El('div');
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (cls || []).forEach(c => e.classes.add(c));
  doc.body.appendChild(e);
  return e;
}

/* ---------- 冒烟 ---------- */
section('启动与初始渲染（main.js 自执行）');
t('DG 命名空间就绪', !!DG && !!DG.ui && !!DG.state);
t('初始视图渲染出厢体', view.innerHTML.indexOf('厢体 · 收容格') >= 0);
t('渲染 6 个空格', (view.innerHTML.match(/空格/g) || []).length === 6, (view.innerHTML.match(/空格/g) || []).length);
t('HUD 已填充', doc.getElementById('hud-desc').textContent === '10');
t('tick 循环已注册', typeof intervalFn === 'function');

section('导航切换');
const navBtns = doc.querySelectorAll('.nav-btn');
click(navBtns[2]); /* 技能树 */
t('切到技能树：分支与看板渲染', view.innerHTML.indexOf('分支 A · 档案扩编') >= 0 && view.innerHTML.indexOf('Ótakmarkað（无限）') >= 0);
t('切换界面轮播台词（第 1 句）', otakBubble.textContent === '出现就是存在。', otakBubble.textContent);
click(navBtns[3]); /* 赌场 */
t('切到赌场：庄家与三级赌注', view.innerHTML.indexOf('未型 / Eidos') >= 0 && view.innerHTML.indexOf('存在') >= 0);
click(navBtns[1]); /* 厢体 */
t('切回厢体', view.innerHTML.indexOf('厢体 · 收容格') >= 0 && DG.ui.view === 'compartment');

section('技能购买（点技能扣描述）');
const st = DG.ui.game;
st.desc = 100;
click(mkEl({ 'data-act': 'skill-buy', 'data-id': 'a1' }));
t('a1 购买成功：格 6→8', st.cells.length === 8 && st.desc === 90);
t('档案日志有「备注录入」', DG.ui.archiveLog.some(l => l.text.indexOf('备注录入') >= 0));
click(mkEl({ 'data-act': 'skill-buy', 'data-id': 'a3' }));
t('越级购买 a3 被拒', !st.skills.a3);

section('赌场一局（选档 → 开局 → 要牌/停牌 → 结算）');
click(navBtns[3]); /* 赌场视图（renderCasino 无视图守卫，须先切过去） */
t('切到赌场：庄家与二十一点牌桌', view.innerHTML.indexOf('未型 / Eidos') >= 0 && view.innerHTML.indexOf('二十一点') >= 0 && view.innerHTML.indexOf('bj-table') >= 0);
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'desc' }));
t('选中描述档', DG.ui.casino.tier === 'desc');
st.desc = 200;
var descBefore = st.desc;
click(mkEl({ 'data-act': 'bj-deal' }));
var bj1 = DG.ui.casino.bj;
var descAfterDeal = st.desc; /* 开局后（含极点直结）的资源值，须在打牌前捕获 */
t('开局建局：玩家两张、注 10（极点开局庄家已摊牌可补牌）', !!bj1 && bj1.state.player.length === 2 && bj1.state.dealer.length >= 2 && bj1.state.bet === 10,
  bj1 ? ('p=' + bj1.state.player.length + ' d=' + bj1.state.dealer.length + ' bet=' + bj1.state.bet + ' phase=' + bj1.phase + ' tier=' + bj1.state.tierId + ' desc=' + st.desc) : 'bj1=null');
t('开局即扣 10 描述（极点开局已直接赔 +15）', st.desc === descBefore - 10 + (bj1.state.openingBlackjack ? 15 : 0), st.desc);
if (bj1.phase === 'playing') {
  t('playing：庄家暗牌渲染（hole，红牌为 red hole）', view.innerHTML.indexOf('bj-card hole') >= 0 || view.innerHTML.indexOf('bj-card red hole') >= 0);
  click(mkEl({ 'data-act': 'bj-hit' }));
  t('要牌后手牌 +1（或爆牌直接结算）', bj1.state.player.length === 3 || bj1.phase === 'done', 'len=' + bj1.state.player.length + '/' + bj1.phase);
}
var guard = 0;
while (DG.ui.casino.bj.phase === 'playing' && guard++ < 20) {
  click(mkEl({ 'data-act': DG.blackjack.basicStrategyAction(DG.ui.casino.bj.state.player) === 'stand' ? 'bj-stand' : 'bj-hit' }));
}
t('一局可以打完（要牌/停牌收敛）', bj1.phase === 'done');
t('结算结果非空', (DG.ui.casino.res.bj.result || '').length > 0);
/* 极点开局在 deal 时已结算（delta 已入账），普通局的 delta 在打牌结算时入账 */
t('结算写回资源：desc = 开局后值 + delta', st.desc === descAfterDeal + (bj1.state.openingBlackjack ? 0 : bj1.state.delta), st.desc + ' vs ' + (descAfterDeal + bj1.state.delta));
var clsOk = bj1.state.outcome === 'lose' ? view.innerHTML.indexOf('casino-result" class="lose"') >= 0
  : bj1.state.outcome === 'push' ? view.innerHTML.indexOf('casino-result" class=""') >= 0
  : view.innerHTML.indexOf('casino-result" class="win"') >= 0;
t('结果框随胜负着色（' + bj1.state.outcome + '）', clsOk);
t('赌局记录有条目', DG.ui.casinoLog.length >= 1);
t('庄家台词已更新（非默认）', eidosLine.textContent.length > 0 && eidosLine.textContent !== '「赔率永远公平。」', eidosLine.textContent);
t('HUD 同步', doc.getElementById('hud-desc').textContent === String(Math.floor(st.desc)));

/* 加倍路径：重开至拿到非极点开局（连开极点概率 4.8%^8，可忽略） */
var bj2 = null, dealGuard = 0;
do {
  st.desc = 200;
  click(mkEl({ 'data-act': 'bj-deal' }));
  bj2 = DG.ui.casino.bj;
} while (bj2.phase !== 'playing' && dealGuard++ < 8);
t('加倍路径：拿到可操作局', bj2.phase === 'playing');
var d2 = st.desc;
click(mkEl({ 'data-act': 'bj-double' }));
t('加倍：注 10→20、再扣 10', bj2.state.doubled === true && bj2.state.bet === 20 && st.desc === d2 - 10 + bj2.state.delta, st.desc + '/' + bj2.state.bet);
t('加倍后一张牌即结算', bj2.phase === 'done' && bj2.state.player.length === 3);

st.mood = 100;
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'mood' }));
var moodBefore = st.mood;
click(mkEl({ 'data-act': 'bj-deal' }));
var bj3 = DG.ui.casino.bj;
t('情绪档开局扣 10 情绪（极点 +15 / 对极点 push 退注 +0）', st.mood === moodBefore - 10 + bj3.state.delta, st.mood + '/delta=' + bj3.state.delta);
var moodAfterDeal = st.mood;
guard = 0;
while (DG.ui.casino.bj.phase === 'playing' && guard++ < 20) {
  click(mkEl({ 'data-act': DG.blackjack.basicStrategyAction(DG.ui.casino.bj.state.player) === 'stand' ? 'bj-stand' : 'bj-hit' }));
}
t('情绪档同样可打完一局', bj3.phase === 'done' && st.mood === moodAfterDeal + (bj3.state.openingBlackjack ? 0 : bj3.state.delta), st.mood);
t('stats.rounds 累计（≥3 局）', st.stats.rounds >= 3, st.stats.rounds);

click(mkEl({ 'data-act': 'tier-select', 'data-id': 'being' }));
click(mkEl({ 'data-act': 'bj-deal' }));
var bj4 = DG.ui.casino.bj;
t('存在档 demo：单位未变（0 收容）', st.cells.filter(c => c.unitId).length === 0 && bj4.state.demo === true);
guard = 0;
while (DG.ui.casino.bj.phase === 'playing' && guard++ < 20) {
  click(mkEl({ 'data-act': DG.blackjack.basicStrategyAction(DG.ui.casino.bj.state.player) === 'stand' ? 'bj-stand' : 'bj-hit' }));
}
t('存在档也能打完（demo 不结算资源）', bj4.phase === 'done' && bj4.state.delta === 0 && (DG.ui.casino.res.bj.result || '').indexOf('demo') >= 0, DG.ui.casino.res.bj.result);

/* 「完成」debuff：HUD 提示路径 */
st.completedUntil = Date.now() + 30000;
DG.ui.renderHud();
t('debuff HUD：产出减半提示', hudCompleted.style.display === '' && /产出减半（剩余 \d+s）/.test(hudCompletedVal.textContent), hudCompletedVal.textContent);
st.completedUntil = 0;
DG.ui.renderHud();
t('debuff 消退后 HUD 隐藏', hudCompleted.style.display === 'none');

/* ---------- 轮盘 ---------- */
section('轮盘（切页签 → 下注 → 旋转 → 结算）');
click(mkEl({ 'data-act': 'game-tab', 'data-id': 'roulette' }));
t('切到轮盘：页签激活 + 投注桌（0 + 36 码 + 外围）', DG.ui.casino.game === 'roulette'
  && view.innerHTML.indexOf('rl-grid') >= 0 && view.innerHTML.indexOf('straight:17') >= 0
  && view.innerHTML.indexOf('data-id="dozen:2"') >= 0 && view.innerHTML.indexOf('data-id="red"') >= 0);
t('轮盘规则文案（单零 / 35:1 / 2.70%）', view.innerHTML.indexOf('欧式单零轮盘') >= 0 && view.innerHTML.indexOf('2.70%') >= 0);
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'desc' }));
st.desc = 300;
click(mkEl({ 'data-act': 'chip-select', 'data-id': '50' }));
t('筹码切到 50', DG.ui.casino.chip === 50);
click(mkEl({ 'data-act': 'rl-bet', 'data-id': 'straight:17' }));
click(mkEl({ 'data-act': 'rl-bet', 'data-id': 'red' }));
t('下注累计：17 号 50 + 红 50 = 100', DG.ui.casino.rl.bets['straight:17'] === 50 && DG.ui.casino.rl.bets.red === 50 && DG.ui.rlStaked() === 100);
t('注区显示筹码徽标', view.innerHTML.indexOf('chip-badge') >= 0);
t('旋转钮可用（未押则禁）', view.innerHTML.indexOf('data-act="rl-spin"') >= 0 && view.innerHTML.indexOf('rl-spin" disabled') < 0);
var rlDescBefore = st.desc, rlRoundsBefore = st.stats.rounds, rlLogBefore = DG.ui.casinoLog.length;
var rlStreakBefore = st.stats.lossStreak;
click(mkEl({ 'data-act': 'rl-spin' }));
var rlState = DG.ui.casino.rl;
t('落袋 0-36 且历史 +1', rlState.pocket !== null && rlState.pocket >= 0 && rlState.pocket <= 36 && rlState.history.length === 1);
var rlExpect = DG.roulette.settleBets([{ id: 'straight:17', stake: 50 }, { id: 'red', stake: 50 }], rlState.pocket);
t('开局扣总注 100 且按内核公式入账', st.desc === rlDescBefore - 100 + rlExpect.net, st.desc + ' vs ' + (rlDescBefore - 100 + rlExpect.net));
t('结果文案含落袋号码', (DG.ui.casino.res.roulette.result || '').indexOf('落袋 ' + rlState.pocket) >= 0, DG.ui.casino.res.roulette.result);
t('结果着色与净额一致', DG.ui.casino.res.roulette.resultCls === (rlExpect.net > 0 ? 'win' : 'lose'), DG.ui.casino.res.roulette.resultCls + '/net=' + rlExpect.net);
/* 连败极点（净输且连败达 5）会额外写一条「完成」记录，故按 +1/+2 预测 */
var rlCompleted = rlExpect.net < 0 && rlStreakBefore + 1 >= DG.casino.COMPLETE_STREAK;
t('赌局记录 +1（连败极点则 +2）、局数 +1', DG.ui.casinoLog.length === rlLogBefore + 1 + (rlCompleted ? 1 : 0) && st.stats.rounds === rlRoundsBefore + 1,
  DG.ui.casinoLog.length + '/' + rlLogBefore + ' completed=' + rlCompleted);
t('HUD 同步', doc.getElementById('hud-desc').textContent === String(Math.floor(st.desc)));
click(mkEl({ 'data-act': 'rl-clear' }));
t('清空注区、旋转钮禁用', DG.ui.rlStaked() === 0 && view.innerHTML.indexOf('rl-spin" disabled') >= 0);
/* 资源不足拒局 */
st.desc = 30;
click(mkEl({ 'data-act': 'rl-bet', 'data-id': 'red' }));
click(mkEl({ 'data-act': 'rl-spin' }));
t('描述不足拒局（资源不动、不加历史）', st.desc === 30 && DG.ui.casino.rl.history.length === 1, st.desc);
/* demo 档（存在） */
click(mkEl({ 'data-act': 'rl-clear' }));
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'being' }));
click(mkEl({ 'data-act': 'rl-bet', 'data-id': 'straight:0' }));
st.desc = 300;
click(mkEl({ 'data-act': 'rl-spin' }));
t('存在档 demo：可旋转但不结算资源', st.desc === 300 && (DG.ui.casino.res.roulette.result || '').indexOf('demo') >= 0, DG.ui.casino.res.roulette.result);

/* ---------- 老虎机 ---------- */
section('老虎机（切页签 → 拉杆 → 结算）');
click(mkEl({ 'data-act': 'game-tab', 'data-id': 'slots' }));
t('切到老虎机：3 卷轴 + 赔付表 + 规则', DG.ui.casino.game === 'slots'
  && view.innerHTML.indexOf('sl-machine') >= 0 && view.innerHTML.indexOf('sl-paytable') >= 0
  && view.innerHTML.indexOf('三连 ×400') >= 0 && view.innerHTML.indexOf('96.4%') >= 0);
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'desc' }));
st.desc = 500;
click(mkEl({ 'data-act': 'chip-select', 'data-id': '10' }));
var slDescBefore = st.desc, slRoundsBefore = st.stats.rounds, slLogBefore = DG.ui.casinoLog.length;
var slStreakBefore = st.stats.lossStreak;
click(mkEl({ 'data-act': 'sl-spin' }));
var slState = DG.ui.casino.sl;
t('拉杆出 3 符且历史 +1', !!slState.reels && slState.reels.length === 3 && slState.history.length === 1);
var slMult = slState.history[0].mult;
t('开局扣 10 并按倍数入账（胜 +10×mult / 负 -10）', st.desc === slDescBefore - 10 + (slMult > 0 ? 10 * slMult : -10), st.desc + '/mult=' + slMult);
t('结果文案非空', (DG.ui.casino.res.slots.result || '').length > 0);
t('中奖着色 win / 未中 lose', DG.ui.casino.res.slots.resultCls === (slMult > 0 ? 'win' : 'lose'), DG.ui.casino.res.slots.resultCls);
var slCompleted = slMult === 0 && slStreakBefore + 1 >= DG.casino.COMPLETE_STREAK;
t('赌局记录 +1（连败极点则 +2）、局数 +1', DG.ui.casinoLog.length === slLogBefore + 1 + (slCompleted ? 1 : 0) && st.stats.rounds === slRoundsBefore + 1,
  DG.ui.casinoLog.length + '/' + slLogBefore + ' completed=' + slCompleted);
t('HUD 同步', doc.getElementById('hud-desc').textContent === String(Math.floor(st.desc)));
/* 资源不足拒局 */
st.desc = 5;
click(mkEl({ 'data-act': 'sl-spin' }));
t('描述不足拒局（资源不动、不加历史）', st.desc === 5 && DG.ui.casino.sl.history.length === 1, st.desc);
/* demo 档（存在） */
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'being' }));
st.desc = 500;
click(mkEl({ 'data-act': 'sl-spin' }));
t('存在档 demo：可拉杆但不结算资源', st.desc === 500 && (DG.ui.casino.res.slots.result || '').indexOf('demo') >= 0, DG.ui.casino.res.slots.result);
/* 切回二十一点：状态保留且结果不串台 */
click(mkEl({ 'data-act': 'game-tab', 'data-id': 'bj' }));
t('切回二十一点：牌桌还在（done 态）', DG.ui.casino.game === 'bj' && DG.ui.casino.bj && DG.ui.casino.bj.phase === 'done' && view.innerHTML.indexOf('bj-table') >= 0);
t('结果分槽不串台（bj 显示自己的 demo 文案）', view.innerHTML.indexOf('存在档 demo') >= 0);

/* ---- 骰宝 / 百家乐 / 事件段：先隔离事件触发，避免弹窗干扰后续点击 ---- */
var realMaybeTrigger = DG.events.maybeTrigger;
DG.events.maybeTrigger = function () { return null; };

section('骰宝（切页签 → 下注 → 投掷 → 结算）');
click(mkEl({ 'data-act': 'game-tab', 'data-id': 'sicbo' }));
t('切到骰宝：投注区 + 规则渲染', DG.ui.casino.game === 'sicbo'
  && view.innerHTML.indexOf('sb-wrap') >= 0 && view.innerHTML.indexOf('sb-area') >= 0
  && view.innerHTML.indexOf('206:1') >= 0 && view.innerHTML.indexOf('1.6%') >= 0);
t('骰宝注区数量（2 大小 + 14 点数 + 6 单 + 6 对 + 6 围 + 5 组合）',
  (view.innerHTML.match(/sb-area/g) || []).length === 39, (view.innerHTML.match(/sb-area/g) || []).length);
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'desc' }));
st.desc = 500;
click(mkEl({ 'data-act': 'chip-select', 'data-id': '10' }));
var sbDescBefore = st.desc, sbRoundsBefore = st.stats.rounds, sbLogBefore = DG.ui.casinoLog.length;
var sbStreakBefore = st.stats.lossStreak;
click(mkEl({ 'data-act': 'sb-bet', 'data-id': 'big' }));
click(mkEl({ 'data-act': 'sb-bet', 'data-id': 'total:9' }));
t('下注累计到已押 20', DG.ui.casino.sb.bets.big === 10 && DG.ui.casino.sb.bets['total:9'] === 10 && DG.ui.sbStaked() === 20);
click(mkEl({ 'data-act': 'sb-roll' }));
var sbState = DG.ui.casino.sb;
var sbExpect = DG.sicbo.settle([{ id: 'big', stake: 10 }, { id: 'total:9', stake: 10 }], sbState.roll);
t('落袋三骰且历史 +1', sbState.roll && sbState.roll.d.length === 3 && sbState.history.length === 1);
t('开局扣总注 20 且按内核公式入账', st.desc === sbDescBefore - 20 + sbExpect.net,
  st.desc + ' vs ' + (sbDescBefore - 20 + sbExpect.net));
t('结果文案含落袋点数', (DG.ui.casino.res.sicbo.result || '').indexOf('（' + sbState.roll.total + ' 点）') >= 0, DG.ui.casino.res.sicbo.result);
t('结果着色与净额一致', DG.ui.casino.res.sicbo.resultCls === (sbExpect.net > 0 ? 'win' : 'lose'), DG.ui.casino.res.sicbo.resultCls);
var sbCompleted = sbExpect.net < 0 && sbStreakBefore + 1 >= DG.casino.COMPLETE_STREAK;
t('赌局记录 +1（连败极点则 +2）、局数 +1、投注已清',
  DG.ui.casinoLog.length === sbLogBefore + 1 + (sbCompleted ? 1 : 0) && st.stats.rounds === sbRoundsBefore + 1 && DG.ui.sbStaked() === 0,
  DG.ui.casinoLog.length + '/' + sbLogBefore);
t('HUD 同步', doc.getElementById('hud-desc').textContent === String(Math.floor(st.desc)));
/* 未下注拒局 */
click(mkEl({ 'data-act': 'sb-roll' }));
t('未下注时投掷被拦（状态行提示、不加历史）', (DG.ui.casino.res.sicbo.status || '').indexOf('先下注') >= 0 && DG.ui.casino.sb.history.length === 1);
/* 资源不足拒局 */
st.desc = 5;
click(mkEl({ 'data-act': 'sb-bet', 'data-id': 'big' }));
t('描述不足拒绝下注（资源不动、不计注）', st.desc === 5 && DG.ui.sbStaked() === 0, st.desc);
/* demo 档 */
st.desc = 500;
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'being' }));
click(mkEl({ 'data-act': 'sb-bet', 'data-id': 'big' }));
click(mkEl({ 'data-act': 'sb-roll' }));
t('存在档 demo：可投掷但不结算资源', st.desc === 500 && (DG.ui.casino.res.sicbo.result || '').indexOf('demo') >= 0, DG.ui.casino.res.sicbo.result);

section('百家乐（切页签 → 押闲/庄/和 → 开牌 → 结算）');
click(mkEl({ 'data-act': 'game-tab', 'data-id': 'baccarat' }));
t('切到百家乐：开牌区 + 三注区 + 规则渲染', DG.ui.casino.game === 'baccarat'
  && view.innerHTML.indexOf('bc-wrap') >= 0 && view.innerHTML.indexOf('bc-bet player') >= 0
  && view.innerHTML.indexOf('bc-bet banker') >= 0 && view.innerHTML.indexOf('bc-bet tie') >= 0
  && view.innerHTML.indexOf('1.06%') >= 0);
t('未开牌时庄闲区为暗牌', (view.innerHTML.match(/bj-card hole/g) || []).length === 4);
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'desc' }));
st.desc = 500;
click(mkEl({ 'data-act': 'chip-select', 'data-id': '10' }));
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'player' }));
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'banker' }));
t('押闲 + 押庄累计 20', DG.ui.casino.bc.bets.player === 10 && DG.ui.casino.bc.bets.banker === 10 && DG.ui.bcStaked() === 20);
var bcDescBefore = st.desc, bcRoundsBefore = st.stats.rounds, bcLogBefore = DG.ui.casinoLog.length;
var bcStreakBefore = st.stats.lossStreak;
click(mkEl({ 'data-act': 'bc-deal' }));
var bcRound = DG.ui.casino.bc.round;
var bcExpect = DG.baccarat.settleBets([{ bet: 'player', stake: 10 }, { bet: 'banker', stake: 10 }], bcRound.outcome);
var bcCompleted = bcExpect.net < 0 && bcStreakBefore + 1 >= DG.casino.COMPLETE_STREAK;
t('开牌：双方手牌 2-3 张、点数 0-9', bcRound && bcRound.player.length >= 2 && bcRound.banker.length >= 2
  && bcRound.pTotal >= 0 && bcRound.pTotal <= 9 && bcRound.bTotal >= 0 && bcRound.bTotal <= 9);
t('开局扣 20 且按内核公式入账', st.desc === bcDescBefore - 20 + bcExpect.net,
  st.desc + ' vs ' + (bcDescBefore - 20 + bcExpect.net));
t('结果文案含比分', (DG.ui.casino.res.baccarat.result || '').indexOf('闲 ' + bcRound.pTotal + ' : ' + bcRound.bTotal + ' 庄') >= 0,
  DG.ui.casino.res.baccarat.result);
t('赌局记录 +1（连败极点则 +2）、局数 +1、路单 +1、注已清',
  DG.ui.casinoLog.length === bcLogBefore + 1 + (bcCompleted ? 1 : 0) && st.stats.rounds === bcRoundsBefore + 1
  && DG.ui.casino.bc.history.length === 1 && DG.ui.bcStaked() === 0,
  DG.ui.casinoLog.length + '/' + bcLogBefore + ' completed=' + bcCompleted);
t('牌面渲染（无暗牌残留）', view.innerHTML.indexOf('bj-card hole') < 0);
/* 连开 3 局：shoe 连续、无崩溃 */
st.desc = 500;
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'banker' }));
click(mkEl({ 'data-act': 'bc-deal' }));
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'player' }));
click(mkEl({ 'data-act': 'bc-deal' }));
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'tie' }));
click(mkEl({ 'data-act': 'bc-deal' }));
t('连开 3 局自洽（shoe 连续、历史 4）', DG.ui.casino.bc.history.length === 4 && DG.ui.casino.bc.shoe.length > 0,
  DG.ui.casino.bc.history.length + '/shoe=' + DG.ui.casino.bc.shoe.length);
/* demo 档 */
click(mkEl({ 'data-act': 'tier-select', 'data-id': 'being' }));
st.desc = 500;
click(mkEl({ 'data-act': 'bc-bet', 'data-id': 'player' }));
click(mkEl({ 'data-act': 'bc-deal' }));
t('存在档 demo：可开牌但不结算资源', st.desc === 500 && (DG.ui.casino.res.baccarat.result || '').indexOf('demo') >= 0,
  DG.ui.casino.res.baccarat.result);

section('事件系统（弹窗 → 选项 → 后果）');
/* 强制返回指定事件（输光的赌徒），验证弹窗与后果 */
DG.events.maybeTrigger = function () { return DG.events.POOL[0]; };
st.desc = 500; st.bonds.eidos = 0;
var evLogBefore = DG.ui.casinoLog.length;
DG.ui.afterRound();
t('事件弹窗打开（标题 + 选项按钮）', modalRoot.innerHTML.indexOf('拍桌子的客人') >= 0
  && (modalRoot.innerHTML.match(/event-choice/g) || []).length === 3, modalRoot.innerHTML.slice(0, 80));
click(mkEl({ 'data-act': 'event-choice', 'data-idx': '0' }));
t('选项 0（垫付）：desc -20、Eidos +1、弹窗关闭、记录 +1',
  st.desc === 480 && st.bonds.eidos === 1 && modalRoot.innerHTML === '' && DG.ui.casinoLog.length === evLogBefore + 1,
  st.desc + '/' + st.bonds.eidos + '/log=' + DG.ui.casinoLog.length);
/* 触发间隔：rounds 等于 lastEventRound 时不触发 */
DG.events.maybeTrigger = realMaybeTrigger;
st.stats.rounds = 10; st.lastEventRound = 10;
DG.ui.casino.event = null;
var evFired = 0;
for (var ei = 0; ei < 50; ei++) { DG.ui.afterRound(); if (DG.ui.casino.event) { evFired++; DG.ui.casino.event = null; DG.ui.closeModal(); } }
t('同局数不重复触发（间隔 <4 局）', evFired === 0, evFired);

click(navBtns[1]); /* 回厢体，后续 section 维持原视角 */

section('收容名录弹窗');
click(mkEl({ 'data-act': 'contain-open' }));
t('名录弹窗打开（69 条）', modalRoot.innerHTML.indexOf('OC 名录') >= 0 && (modalRoot.innerHTML.match(/roster-contain/g) || []).length === 69);
const worldSel = mkEl({ 'data-act': 'roster-world' }); worldSel.tagName = 'select'; worldSel.value = '黄昏之门';
change(worldSel);
t('世界筛选生效（黄昏之门）', (modalRoot.innerHTML.match(/黄昏之门/g) || []).length > 10);
worldSel.value = '全部世界'; change(worldSel);
const rareSel = mkEl({ 'data-act': 'roster-rarity' }); rareSel.tagName = 'select'; rareSel.value = 'DISASTER';
change(rareSel);
t('稀有度筛选生效（DISASTER 恰 2 条）', (modalRoot.innerHTML.match(/roster-contain/g) || []).length === 2, (modalRoot.innerHTML.match(/roster-contain/g) || []).length);
click(mkEl({ 'data-act': 'roster-contain', 'data-id': 'oc_otak' }));
t('收容 oc_otak 成功并入格', st.cells[0].unitId === 'oc_otak' && modalRoot.innerHTML === '');
t('档案日志有「收录」', DG.ui.archiveLog.some(l => l.text.indexOf('收录') >= 0));

section('压制与调离');
st.mood = 5;
click(mkEl({ 'data-act': 'suppress' }));
t('情绪不足时压制被拒', DG.ui.archiveLog.every(l => l.text.indexOf('压制执行') < 0));
st.mood = 100; st.pollution = 60;
click(mkEl({ 'data-act': 'suppress' }));
t('压制成功：污染 60→35', st.pollution === 35 && st.suppressUntil > Date.now());
click(mkEl({ 'data-act': 'cell-remove', 'data-idx': '0' }));
t('调离需确认（弹窗打开）', modalRoot.innerHTML.indexOf('确认') >= 0);
click(mkEl({ 'data-act': 'modal-ok' }));
t('确认后单位出册', !st.cells[0].unitId && st.stats.removed === 1);

section('收容失效（tick 越界触发）');
DG.state.contain(st, 'oc_otak', Date.now()); /* 重新入格，保证污染持续增长 */
st.pollution = 99.99;
intervalFn();
t('失效弹窗打开', modalRoot.innerHTML.indexOf('收容失效记录') >= 0);
t('stats.failures +1', st.stats.failures === 1);
t('污染回落', st.pollution <= 35, st.pollution);
click(mkEl({ 'data-act': 'modal-close' }));
t('弹窗可关闭', modalRoot.innerHTML === '');

section('Ótakmarkað 挂机台词');
DG.ui.view = 'skilltree';
DG.ui.lastInput = Date.now() - 61000;
otakBubble.textContent = '出现就是存在。';
DG.ui.checkIdle(Date.now());
t('静默 60 秒后说「你还在啊。」', otakBubble.textContent === '你还在啊。', otakBubble.textContent);

section('门面 · 殡仪馆');
click(navBtns[0]); /* 门面 */
t('五个门面都列出来', (view.innerHTML.match(/faction-card/g) || []).length === 5);
t('没开工的标出来', view.innerHTML.indexOf('还没开工') >= 0);
t('初期没有剧情卡', view.innerHTML.indexOf('story-box') < 0);
click(mkEl({ 'data-act': 'faction-pick', 'data-id': 'weizhi' }));
t('点没开工的门面给提示，不换视图', view.innerHTML.indexOf('faction-card') >= 0);
click(mkEl({ 'data-act': 'faction-pick', 'data-id': 'wanren' }));
t('选完人之门后显示殡仪馆', view.innerHTML.indexOf('殡仪馆') >= 0 && view.innerHTML.indexOf('接一单') >= 0);
t('还没单时能接单', DG.ui.game.funeral.faction === 'wanren' && DG.ui.game.funeral.active === null);
click(mkEl({ 'data-act': 'funeral-start' }));
t('接单后出现五步与选项', view.innerHTML.indexOf('收尸') >= 0 && view.innerHTML.indexOf('step-chip') >= 0);
t('选项按钮渲染', (view.innerHTML.match(/funeral-choice/g) || []).length >= 2);
click(mkEl({ 'data-act': 'funeral-choice', 'data-step': 'receive', 'data-id': 'check' }));
t('选一步后进入洗身', view.innerHTML.indexOf('洗身') >= 0 && DG.ui.game.funeral.active.step === 1);
click(mkEl({ 'data-act': 'funeral-choice', 'data-step': 'wash', 'data-id': 'own' }));
click(mkEl({ 'data-act': 'funeral-choice', 'data-step': 'dress', 'data-id': 'own_clothes' }));
click(mkEl({ 'data-act': 'funeral-choice', 'data-step': 'eulogy', 'data-id': 'write' }));
click(mkEl({ 'data-act': 'funeral-choice', 'data-step': 'burial', 'data-id': 'plain' }));
t('五步走完出现结单按钮', view.innerHTML.indexOf('结这一单') >= 0);
var moneyBefore = DG.ui.game.funeral.money;
click(mkEl({ 'data-act': 'funeral-settle' }));
t('结单后入账', DG.ui.game.funeral.money !== moneyBefore && DG.ui.game.funeral.ordersDone === 1);
t('经手记录出现', view.innerHTML.indexOf('经手的单') >= 0);
t('接单按钮回来', view.innerHTML.indexOf('接一单') >= 0);

section('demo 尾段 · 赌场合作');
DG.ui.view = 'business';
DG.ui.game.funeral.stage = 'eidos_ready';
DG.ui.game.bonds.eidos = 1;
DG.ui.renderBusiness();
t('推进后出现剧情卡', view.innerHTML.indexOf('story-box') >= 0);
click(mkEl({ 'data-act': 'story-play', 'data-id': 'casino' }));
t('演完出现合作卡', view.innerHTML.indexOf('合作 · 赌场') >= 0);
t('抽成文案在', view.innerHTML.indexOf('抽两成') >= 0 || view.innerHTML.indexOf('两成') >= 0);
click(mkEl({ 'data-act': 'go-casino' }));
t('点去赌场切到赌场视图', DG.ui.view === 'casino' && view.innerHTML.indexOf('二十一点') >= 0);

/* ---------- 汇总 ---------- */
console.log('\n================================');
console.log('通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) { console.log('存在失败项！'); process.exit(1); }
console.log('全部通过。');
