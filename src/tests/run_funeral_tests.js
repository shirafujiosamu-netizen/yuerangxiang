/* 殡仪馆开局测试（node 直接跑）
 * 运行：node src/tests/run_funeral_tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const FILES = ['core.js', 'state.js', 'funeral.js'];
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n'), sandbox, { filename: 'funeral-bundle.js' });

var DG = sandbox.DG;
var F = DG.funeral;
var pass = 0, fail = 0, results = [];
function t(name, ok, extra) {
  if (ok) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra != null ? ' -> ' + extra : '')); }
}
function section(s) { results.push('', '== ' + s + ' =='); }
function seeded(n) { var i = 0; return function () { i++; return ((n * i) % 97) / 97; }; }

section('初始与兜底');
var s0 = DG.state.createInitial();
var f0 = F.ensure(s0);
t('新档没有门面', f0.faction === null && f0.stage === 'pick');
t('口碑 50、钱 0', f0.rep === 50 && f0.money === 0);
t('没开工时不能接单', F.startOrder(s0).ok === false);
t('坏档被修好', (function () {
  var bad = { funeral: { faction: 'wanren', active: { step: 2 } }, bonds: null };
  var f = F.ensure(bad);
  return f.active === null && bad.bonds.eidos === 0;
})());

section('选门面');
t('完人之门可开门', F.pickFaction(s0, 'wanren').ok === true && s0.funeral.stage === 'shop');
t('未知信仰还没开工，给明确错误', (function () {
  var r = F.pickFaction(s0, 'weizhi');
  return r.ok === false && /还没开工/.test(r.err);
})());
t('不存在的门面给明确错误', F.pickFaction(s0, 'nope').ok === false);

section('接单与五步');
var s1 = DG.state.createInitial(); F.pickFaction(s1, 'wanren');
var r1 = F.startOrder(s1, seeded(3));
t('接单成功且进第一格', r1.ok === true && r1.step.id === 'receive');
t('同时只能有一单', F.startOrder(s1).ok === false);
t('跳步被拒', F.choose(s1, 'wash', 'own').ok === false);
t('走完收尸，下一步是洗身', (function () {
  var r = F.choose(s1, 'receive', 'check');
  return r.ok === true && r.step.id === 'wash' && r.done === false;
})());
t('收尸「掀白布」体面 +8、关系 +1', s1.funeral.active.dig === 58 && s1.bonds.eidos === 1);
t('未走完不能结算', F.settle(s1).ok === false);

section('五步走完并结算');
F.choose(s1, 'wash', 'own');
F.choose(s1, 'dress', 'own_clothes');
F.choose(s1, 'eulogy', 'write');
var rEnd = F.choose(s1, 'burial', 'plain');
t('最后一步 done=true', rEnd.ok === true && rEnd.done === true);
var digBefore = s1.funeral.active.dig;
var repBefore = s1.funeral.rep;
var rec = F.settle(s1);
t('结算返回记录', rec.ok === true && !!rec.rec);
t('结算后手上清空、单数 +1', s1.funeral.active === null && s1.funeral.ordersDone === 1);
t('钱按预算 × 体面比发放', (function () {
  var o = rec.rec.order;
  var expect = Math.round(o.purse * (digBefore / 50)) + rec.rec.extras;
  return rec.rec.pay === expect;
})(), rec.rec && rec.rec.pay);
t('口碑在过程中累加后按体面收尾', s1.funeral.rep === DG.util.clamp(repBefore + Math.round((digBefore - 50) / 10), 0, 100),
  repBefore + ' -> ' + s1.funeral.rep);

section('体面上下限');
var s2 = DG.state.createInitial(); F.pickFaction(s2, 'wanren');
F.startOrder(s2, seeded(5));
F.choose(s2, 'receive', 'rush');
F.choose(s2, 'wash', 'perfume');
F.choose(s2, 'dress', 'cheap');
F.choose(s2, 'burial', 'cut');
F.choose(s2, 'eulogy', 'script');
t('一路敷衍体面掉到底也不小于 0', s2.funeral.active.dig >= 0 && s2.funeral.active.dig < 50, s2.funeral.active.dig);

section('无名尸：预算 0 也能结单');
var s3 = DG.state.createInitial(); F.pickFaction(s3, 'wanren');
var un = null;
for (var i = 0; i < 20 && !un; i++) {
  F.startOrder(s3, seeded(i + 1));
  if (s3.funeral.active.order.kind === 'nameless') un = s3.funeral.active.order;
  else { // 丢掉这一单，直接清空
    s3.funeral.active = null;
  }
}
t('名册里有无名尸这一单', !!un);
if (un) {
  s3.funeral.active = { order: un, step: 5, dig: 50, money: 0, log: [] };
  var recN = F.settle(s3);
  t('无名尸零预算不发钱', recN.ok === true && recN.rec.pay === 0);
}

section('剧情门');
var s4 = DG.state.createInitial(); F.pickFaction(s4, 'wanren');
function finishOne(s) {
  F.startOrder(s, seeded(s.funeral.ordersDone + 2));
  F.choose(s, 'receive', 'rule');
  F.choose(s, 'wash', 'own');
  F.choose(s, 'dress', 'own_clothes');
  F.choose(s, 'eulogy', 'script');
  F.choose(s, 'burial', 'plain');
  return F.settle(s);
}
finishOne(s4); finishOne(s4);
t('做完两单还没有剧情', F.nextStory(s4) === null);
finishOne(s4);
t('做完三单解锁开学', (function () { var n = F.nextStory(s4); return !!n && n.id === 'university'; })());
F.playStory(s4, 'university');
t('开学后进未型这条线', s4.funeral.stage === 'eidos' && s4.bonds.eidos >= 1);
t('开学之后下一段是未型，不是赌场', (function () {
  var n = F.nextStory(s4);
  return !!n && n.id === 'eidos';
})());
F.playStory(s4, 'eidos');
t('赌场邀约可触发', (function () { var n = F.nextStory(s4); return !!n && n.id === 'casino'; })());
F.playStory(s4, 'casino');
t('赌场演完，demo 收尾', s4.funeral.stage === 'end' && s4.funeral.demoDone === true);

section('选择表完整性');
t('五步都有选项', F.STEPS.every(function (st) { return (F.CHOICES[st.id] || []).length >= 2; }));
t('每项选择都带后果与文案', F.STEPS.every(function (st) {
  return F.CHOICES[st.id].every(function (c) { return c.d && typeof c.out === 'string' && c.out.length > 4; });
}));
t('Eidos 选项要关系 >=1 才出现', (function () {
  var s = DG.state.createInitial();
  var before = F.choicesFor(s, 'eulogy').map(function (c) { return c.id; }).indexOf('eidos');
  s.bonds.eidos = 2;
  var after = F.choicesFor(s, 'eulogy').map(function (c) { return c.id; }).indexOf('eidos');
  return before < 0 && after >= 0;
})());

section('demo 尾段：与赌场合作');
(function () {
  var s2 = DG.state.createInitial();
  var f2 = F.ensure(s2);
  f2.faction = 'wanren';
  f2.stage = 'eidos_ready';
  s2.bonds.eidos = 1;
  var s3 = F.nextStory(s2);
  t('推进到赌场一段', s3 && s3.id === 'casino', s3 && s3.id);
  F.playStory(s2, 'casino');
  t('合作标记成立', F.hasDeal(s2) === true);
  t('抽成是两成', f2.deal && f2.deal.cut === 0.2, f2.deal && f2.deal.cut);
  t('演完不再有下一段', F.nextStory(s2) === null);
  t('demoDone 置位', f2.demoDone === true);
})();

console.log(results.join('\n'));
console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);
