/* 营业日 / 账本 / 口碑测试（node 直接跑）
 * 运行：node src/tests/run_house_tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const FILES = ['data.js', 'core.js', 'state.js', 'pollution.js', 'skilltree.js', 'casino.js', 'house.js'];
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n'), sandbox, { filename: 'logic-bundle.js' });

var DG = sandbox.DG;
var pass = 0, fail = 0, results = [];
function t(name, ok, extra) {
  if (ok) { pass++; results.push('PASS ' + name); }
  else { fail++; results.push('FAIL ' + name + (extra != null ? ' -> ' + extra : '')); }
}
function section(s) { results.push('', '== ' + s + ' =='); }

var H = DG.house;

section('初始化');
var s0 = DG.state.createInitial();
t('新档带 casino2 骨架', !!s0.casino2 && s0.casino2.phase === 'night');
t('初始第 1 日、0 局、口碑 50', s0.casino2.day === 1 && s0.casino2.rounds === 0 && s0.casino2.reputation === 50);
t('ensure 修补破损字段', (function () {
  var broken = { casino2: { phase: 'x', day: 'a' } };
  var h = H.ensure(broken);
  return h.phase === 'night' && h.day === 1 && h.reputation === 50 && Array.isArray(h.ledger);
})());

section('记局');
var s1 = DG.state.createInitial();
H.recordRound(s1, 'bj', 10);
t('一局记进当日', s1.casino2.rounds === 1 && s1.casino2.perTable.bj.rounds === 1 && s1.casino2.perTable.bj.net === 10);
H.recordRound(s1, 'bj', -30);
H.recordRound(s1, 'sicbo', 5);
t('同桌流水累加', s1.casino2.perTable.bj.net === -20, s1.casino2.perTable.bj.net);
t('跨桌分别记账', s1.casino2.perTable.sicbo.rounds === 1 && s1.casino2.perTable.bj.rounds === 2);
t('今日净额汇总', H.todayNet(s1) === -15, H.todayNet(s1));

section('打烊');
var s2 = DG.state.createInitial();
var closed = null;
for (var i = 0; i < H.DAY_ROUNDS; i++) {
  var r = H.recordRound(s2, i % 2 === 0 ? 'bj' : 'roulette', i === 0 ? 20 : -10);
  if (r.closed) closed = r;
}
t('第 8 局自动打烊', !!closed && s2.casino2.phase === 'prep', s2.casino2.phase);
t('账本只记一条', s2.casino2.ledger.length === 1, s2.casino2.ledger.length);
var e = s2.casino2.ledger[0];
t('账本合计 = 当日净额', e.net === (20 + 7 * -10), e.net);
t('账本记录局数与日号', e.rounds === H.DAY_ROUNDS && e.day === 1);
t('口碑按净负下调（-2 以内）', e.repDelta >= -2 && e.repDelta <= 2 && e.repAfter === e.repBefore + e.repDelta, e.repDelta);
t('已打烊不再记局', (function () {
  var before = s2.casino2.rounds;
  var r2 = H.recordRound(s2, 'slots', 99);
  return !r2.closed && s2.casino2.rounds === before;
})());
t('closeDay 幂等', H.closeDay(s2).net === e.net && s2.casino2.ledger.length === 1);

section('口碑边界');
var s3 = DG.state.createInitial();
s3.casino2.reputation = 99;
H.repAdd(s3, 5);
t('口碑封顶 100', s3.casino2.reputation === 100, s3.casino2.reputation);
s3.casino2.reputation = 1;
H.repAdd(s3, -5);
t('口碑封底 0', s3.casino2.reputation === 0, s3.casino2.reputation);

section('开门');
var s4 = DG.state.createInitial();
H.recordRound(s4, 'bj', 10);
for (var j = 1; j < H.DAY_ROUNDS; j++) H.recordRound(s4, 'bj', 0);
H.nextDay(s4);
t('次日重置：日号 +1、局数清零、流水清空', s4.casino2.day === 2 && s4.casino2.rounds === 0
  && Object.keys(s4.casino2.perTable).length === 0 && s4.casino2.phase === 'night');
t('账本跨日保留', s4.casino2.ledger.length === 1);

section('账本上限');
var s5 = DG.state.createInitial();
for (var d = 0; d < 35; d++) {
  for (var k = 0; k < H.DAY_ROUNDS; k++) H.recordRound(s5, 'bj', 0);
  H.nextDay(s5);
}
t('账本最多留 30 条', s5.casino2.ledger.length === 30, s5.casino2.ledger.length);

console.log(results.join('\n'));
console.log('\n===== ' + pass + ' 通过 / ' + fail + ' 失败 =====');
process.exit(fail ? 1 : 0);
