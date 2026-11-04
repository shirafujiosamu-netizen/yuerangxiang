/* Node 自测：用 vm 把纯逻辑模块（data/core/state/pollution/skilltree/casino/archive）
 * 打包进一个沙箱执行后跑断言。ui.js / main.js 依赖 DOM，不在此加载，
 * 由 node --check 单独做语法校验（见 docs/dev_notes.md）。
 *
 * 运行：node src/tests/run_node_tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', 'js');
const LOGIC_FILES = ['data.js', 'core.js', 'state.js', 'pollution.js', 'skilltree.js', 'casino.js', 'house.js', 'archive.js'];

const bundle = LOGIC_FILES.map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: 'logic-bundle.js' });

const DG = sandbox.DG;
if (!DG) { console.error('FATAL: DG 命名空间未建立'); process.exit(1); }

let passed = 0, failed = 0;
function t(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
function section(s) { console.log('\n== ' + s + ' =='); }

/* ---------- 1. 数据 ---------- */
section('data.js');
t('单位数 = 69', DG.archive.all().length === 69, DG.archive.all().length);
t('oc_otak 存在且 SSR/desc', (() => { const u = DG.archive.byId('oc_otak'); return u && u.rarity === 'SSR' && u.yield === 'desc' && u.quotes.length >= 2; })());
t('dk_eidos 存在', !!DG.archive.byId('dk_eidos'));
t('DISASTER 恰 2 个', DG.archive.filter({ cells: [] }, { rarity: 'DISASTER' }).length === 2);
t('全部单位有 color/yieldRate/pollution', DG.archive.all().every(u => /^#[0-9a-f]{6}$/i.test(u.color) && u.yieldRate > 0 && u.pollution > 0));

/* ---------- 2. 初始状态与收容 ---------- */
section('state：初始状态 / 收容');
let s = DG.state.createInitial();
t('初始 6 格全空', s.cells.length === 6 && s.cells.every(c => !c.unitId));
t('初始资源 desc=10, mood=10', s.desc === 10 && s.mood === 10);
t('收容 oc_otak 成功', DG.state.contain(s, 'oc_otak').ok);
t('收容 oc_gott / oc_eili 成功', DG.state.contain(s, 'oc_gott').ok && DG.state.contain(s, 'oc_eili').ok);
t('重复收容被拒', !DG.state.contain(s, 'oc_otak').ok);
t('不存在的 id 被拒', !DG.state.contain(s, 'nope').ok);
/* 填满 6 格：otak(SSR) / gott(R) / eili(SR) / full(R) / qijiu(R) / jing(R) */
t('再收 3 个填满 6 格', DG.state.contain(s, 'oc_full').ok && DG.state.contain(s, 'oc_qijiu').ok && DG.state.contain(s, 'oc_jing').ok);
t('第 7 个收容被拒（无空格）', !DG.state.contain(s, 'oc_hui').ok);
t('空格索引推进正确', s.cells[0].unitId === 'oc_otak' && s.cells[2].unitId === 'oc_eili');

/* ---------- 3. 产出循环 ---------- */
section('state：产出 tick');
let before = s.desc;
DG.state.tick(s, 10, 1e12); /* 1e12 为虚拟时钟，远离任何 haltedUntil */
/* 每秒产出 = 3×1.5(SSR) + 1×1(R) + 2×1.25(SR) + 1×1(R)×3 = 11 */
t('10 秒 desc +110（含稀有度倍率）', Math.abs(s.desc - before - 110) < 1e-9, s.desc - before);
t('mood 不变（无 mood 单位）', s.mood === 10);
/* 每秒污染 = 11 × 0.03（POLLUTION_SCALE 正式值）= 0.33 */
t('污染度 10 秒 +3.3（0.33/s）', Math.abs(s.pollution - 3.3) < 1e-9, s.pollution);

/* ---------- 4. 技能树 ---------- */
section('skilltree');
t('8 节点 / 2 分支', DG.skills.NODES.length === 8 && new Set(DG.skills.NODES.map(n => n.branch)).size === 2);
t('a2 需要 a1', !DG.skills.canBuy(s, 'a2').ok);
t('描述不足时 b 系列也可买：desc 足够 b1', DG.skills.buy(s, 'b1').ok && !!s.skills.b1);
t('b1 后污染增速 -20%（0.33→0.264）', Math.abs(DG.pollution.rate(s, 1e12) - 0.264) < 1e-9, DG.pollution.rate(s, 1e12));
t('买 a1：格 6→8', DG.skills.buy(s, 'a1').ok && s.cells.length === 8);
t('新格为空且可收容', DG.state.freeCellIndex(s) === 6 && DG.state.contain(s, 'oc_levi').ok);
t('买 a2 后 desc 产出 ×1.25（12→15）', DG.skills.buy(s, 'a2').ok && Math.abs(DG.state.outputPerSecond(s, 1e12).desc - 15) < 1e-9, DG.state.outputPerSecond(s, 1e12).desc);
s.desc = 1000; /* 后续技能链成本递增，补足测试资源 */
t('a3 需 a2、a4 需 a3，买满封顶 11 格', DG.skills.buy(s, 'a3').ok && DG.skills.buy(s, 'a4').ok && s.cells.length === 11);
t('重复购买被拒', !DG.skills.buy(s, 'a1').ok);
t('封顶 11 格', s.cells.length === DG.MAX_CELLS);

/* ---------- 5. 压制 ---------- */
section('pollution：压制');
s.mood = 5;
t('情绪不足时压制失败', !DG.pollution.suppress(s, 1e12).ok);
s.mood = 100; s.pollution = 50;
let sup = DG.pollution.suppress(s, 1e12);
t('压制成功：-25 情绪、-25 污染', sup.ok && s.mood === 80 && s.pollution === 25);
t('压制期间速率减半', Math.abs(DG.pollution.rate(s, 1e12) * 2 - DG.pollution.rate(s, 1e12 + 31000)) < 1e-9, DG.pollution.rate(s, 1e12));
t('压制结束（+30s）后恢复原速', (function () { var a = DG.pollution.rate(s, 1e12 + 31000); return Math.abs(a - DG.pollution.rate(s, 1e12) * 2) < 1e-9; })());

/* ---------- 6. 收容失效 ---------- */
section('pollution：收容失效');
function freshWith(unitId) {
  const st = DG.state.createInitial();
  DG.state.contain(st, unitId, 1e12);
  st.pollution = 100;
  return st;
}
let st1 = freshWith('oc_otak'); /* SSR */
let ev1 = DG.pollution.resolveFailure(st1, 1e12, () => 0.99);
t('rng=0.99 → 逃逸（SSR）', ev1.outcome === 'escape' && !st1.cells[0].unitId && st1.stats.removed === 1);
t('逃逸文案含「备注：灭门」', ev1.lines.some(l => l.indexOf('备注：灭门') >= 0));
t('失效后污染回落 35 且进入宽限期', st1.pollution === 35 && st1.breachGraceUntil === 1e12 + 30000);

let st2 = freshWith('oc_otak');
let ev2 = DG.pollution.resolveFailure(st2, 1e12, () => 0.5);
t('rng=0.5 → 降级 SSR→SR', ev2.outcome === 'drop' && st2.cells[0].rarity === 'SR' && ev2.newRarity === 'SR');

let st3 = freshWith('oc_otak');
let ev3 = DG.pollution.resolveFailure(st3, 1e12, () => 0.1);
t('rng=0.1 → 冻结 60 秒', ev3.outcome === 'halt' && st3.cells[0].haltedUntil === 1e12 + 60000);
t('冻结期间产出为 0', DG.state.unitOutput(st3, st3.cells[0], 1e12 + 1000).desc === 0);

let st4 = freshWith('oc_langya'); /* DISASTER，rng=0.1 也应逃逸 */
let ev4 = DG.pollution.resolveFailure(st4, 1e12, () => 0.1);
t('DISASTER 恒逃逸', ev4.outcome === 'escape' && !st4.cells[0].unitId);

let st5 = freshWith('oc_gott'); /* R 级，roll=0.5 时降无可降 → 逃逸 */
let ev5 = DG.pollution.resolveFailure(st5, 1e12, () => 0.5);
t('R 级「降级」转为逃逸', ev5.outcome === 'escape');

/* tick 越界触发 breach */
let st6 = freshWith('oc_gott'); st6.pollution = 99.98;
let r6 = DG.state.tick(st6, 1, 1e12);
t('污染越 100 时 tick 返回 breach', r6.breach === true);
let st7 = freshWith('oc_gott'); st7.pollution = 10;
t('未越界不 breach', DG.state.tick(st7, 1, 1e12).breach === false);

/* ---------- 7. 赌场 ---------- */
section('casino');
let poor = DG.state.createInitial(); poor.desc = 5;
t('描述不足时无法开局', !DG.casino.canStart(poor, 'desc').ok);
let c1 = DG.state.createInitial(); c1.desc = 100; c1.mood = 100;
t('开局扣 10 描述', DG.casino.start(c1, 'desc').ok && c1.desc === 90);
let w = DG.casino.resolve(c1, 'desc', () => 0.10);
t('rng=0.10 → 胜，净赚 12（90→112，payout 1.2）', w.win && w.roll === 10 && w.delta === 12 && c1.desc === 112 && c1.stats.wins === 1);
t('再开局扣 10', DG.casino.start(c1, 'desc').ok && c1.desc === 102);
let l = DG.casino.resolve(c1, 'desc', () => 0.90);
t('rng=0.90 → 负，不动（102→102）', !l.win && l.roll === 90 && c1.desc === 102 && c1.stats.lossStreak === 1);
t('情绪档开局扣 10', DG.casino.start(c1, 'mood').ok && c1.mood === 90);
let m = DG.casino.resolve(c1, 'mood', () => 0.10);
t('情绪档同样 1.2:1（90→112）', m.win && c1.mood === 112);
let b1 = DG.casino.start(c1, 'being');
let b2 = DG.casino.resolve(c1, 'being', () => 0.10);
t('存在档 demo：不扣资源、不删单位', b1.ok && b2.demo && c1.desc === 102 && c1.mood === 112 && c1.cells.filter(c => c.unitId).length === 0);
let c5 = DG.state.createInitial(); c5.desc = 100;
let lastRes = null;
for (let i = 0; i < 5; i++) { DG.casino.start(c5, 'desc'); lastRes = DG.casino.resolve(c5, 'desc', () => 0.99); }
t('连输 5 局触发「完成」：completed + debuff 生效 + 连败清零', lastRes.completed === true && lastRes.completionText.indexOf('完成') >= 0 && c5.completedUntil > 0 && c5.stats.lossStreak === 0);
t('debuff 期间单位产出减半', (function () {
  let cd = DG.state.createInitial();
  DG.state.contain(cd, 'oc_gott', 1e12); /* R：1 desc/s */
  cd.completedUntil = 1e12 + 60000;
  return Math.abs(DG.state.outputPerSecond(cd, 1e12).desc - 0.5) < 1e-9;
})());
t('debuff 过期后恢复全速', (function () {
  let cd = DG.state.createInitial();
  DG.state.contain(cd, 'oc_gott', 1e12);
  cd.completedUntil = 1e12 - 1;
  return Math.abs(DG.state.outputPerSecond(cd, 1e12).desc - 1) < 1e-9 && !DG.casino.isCompleted(cd, 1e12);
})());

/* ---------- 8. 离线补算 ---------- */
section('state：离线补算');
let o = DG.state.createInitial();
DG.state.contain(o, 'oc_gott', 1e12); /* 1 desc/s、1 pollution */
o.lastSeen = 5e12;
let sum = DG.state.applyOffline(o, 5e12 + 3600 * 1000);
t('离线 1 小时：desc +1800（1/s × 3600 × 50%）', Math.abs(o.desc - 10 - 1800) < 1e-6, o.desc);
t('离线污染 +54（0.03/s × 3600 × 50%），未失效', Math.abs(o.pollution - 54) < 1e-6 && sum.failure === null, o.pollution);
t('汇总 seconds=3600', sum.seconds === 3600);
let o2 = DG.state.createInitial();
o2.lastSeen = 5e12;
let sum2 = DG.state.applyOffline(o2, 5e12 + 5 * 3600 * 1000);
t('离线 5 小时：封顶 7200 秒，其余忽略', sum2.seconds === 7200 && sum2.capped && sum2.skipped === 10800);
let o3 = DG.state.createInitial();
DG.state.contain(o3, 'oc_otak', 5e12); /* 3 pollution/s 离线会破百 */
o3.lastSeen = 5e12;
let sum3 = DG.state.applyOffline(o3, 5e12 + 3600 * 1000);
t('离线期间最多触发一次失效', sum3.failure !== null && o3.stats.failures === 1);

/* ---------- 9. 名录筛选 ---------- */
section('archive：名录筛选');
let f1 = DG.archive.filter({ cells: [] }, { world: '黄昏之门' });
t('按世界筛选：黄昏之门', f1.length > 0 && f1.every(r => r.unit.world === '黄昏之门'));
let f2 = DG.archive.filter({ cells: [] }, { rarity: 'R' });
t('按稀有度筛选：R', f2.length > 0 && f2.every(r => r.unit.rarity === 'R'));
let f3 = DG.archive.filter({ cells: [] }, {});
t('无筛选返回 69', f3.length === 69);
let f4 = DG.archive.filter(s, {});
t('已收容单位被标记 contained', f4.filter(r => r.contained).length === 7, f4.filter(r => r.contained).length);

/* ---------- 10. 存档 ---------- */
section('store / migrate（Node 无 localStorage）');
t('无 localStorage 时 load() 返回 null', DG.store.load() === null);
t('无 localStorage 时 save() 返回 false 且不抛错', DG.store.save(s) === false);
let round = JSON.parse(JSON.stringify(s));
let mig = DG.state.migrate(round);
t('JSON 往返 + migrate 保持 11 格与技能', mig.cells.length === 11 && !!mig.skills.a4);
let broken = DG.state.migrate({ v: 1 });
t('缺字段的存档被补全', broken.cells.length === 6 && broken.desc === 10);
t('存档 key 前缀正确', DG.SAVE_PREFIX === 'duskgate_save_' && DG.SAVE_KEY.indexOf('duskgate_save_') === 0);

/* ---------- 汇总 ---------- */
console.log('\n================================');
console.log('通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) { console.log('存在失败项！'); process.exit(1); }
console.log('全部通过。');
