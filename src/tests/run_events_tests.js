/* 事件系统内核测试（纯逻辑，node 运行） */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const JS_DIR = path.join(__dirname, '..', 'js');
const bundle = ['core.js', 'state.js', 'casino.js', 'events.js']
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n;\n');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });
const EV = sandbox.DG.events, DG = sandbox.DG;

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
}
function section(s) { console.log('\n== ' + s + ' =='); }

function freshState() {
  const s = DG.state.createInitial();
  s.desc = 200; s.mood = 100;
  s.stats.rounds = 20;          /* 距离上次事件足够远 */
  s.lastEventRound = 0;
  s.lastEventIds = [];
  return s;
}

section('事件池结构');
{
  t('池共 6 个事件（5 闹事 + 1 陪玩）', EV.POOL.length === 6, EV.POOL.length);
  t('5 个 trouble 中 4 个有普通 NPC + 1 个氛围事件（midnight 无 NPC）',
    EV.POOL.filter(e => e.type === 'trouble' && e.npc).length === 4
    && EV.POOL.filter(e => e.type === 'trouble' && !e.npc).length === 1);
  t('唯一 companion 是 Eidos', EV.POOL.filter(e => e.type === 'companion').every(e => e.npc === '未型 / Eidos'));
  t('陪玩事件 cond 要求 Eidos 关系 ≥2', (function () {
    const e = EV.POOL.find(x => x.id === 'eidos_play');
    return e.cond(freshState()) === false && e.cond({ bonds: { eidos: 2 } }) === true;
  })());
  t('所有事件至少 2 个选项', EV.POOL.every(e => e.choices.length >= 2));
  t('事件 id 无重复', new Set(EV.POOL.map(e => e.id)).size === EV.POOL.length);
}

section('触发机制');
{
  /* 间隔不足不触发 */
  let s = freshState(); s.stats.rounds = 3; s.lastEventRound = 0;
  let fired = 0;
  for (let i = 0; i < 50; i++) if (EV.maybeTrigger(s, { rng: () => 0, now: 1000 })) fired++;
  t('间隔 <4 局不触发', fired === 0, 'fired=' + fired);

  /* rng=0 必触发 */
  s = freshState();
  const ev = EV.maybeTrigger(s, { rng: () => 0, now: 1000 });
  t('间隔足够 + rng=0 必触发', !!ev && typeof ev.id === 'string', ev && ev.id);
  t('触发后记录 lastEventRound', s.lastEventRound === 20, s.lastEventRound);
  t('触发后写入 lastEventIds', s.lastEventIds.length === 1 && s.lastEventIds[0] === ev.id);

  /* rng=1 不触发 */
  s = freshState();
  t('rng=1 不触发', EV.maybeTrigger(s, { rng: () => 0.999, now: 1000 }) === null);

  /* 连败加权：p 从 0.22 提到 0.33 */
  s = freshState(); s.stats.lossStreak = 2;
  let cnt = 0;
  for (let i = 0; i < 20000; i++) {
    const s2 = freshState(); s2.stats.lossStreak = 2;
    if (EV.maybeTrigger(s2, { rng: () => i / 20000, now: 1000 })) cnt++;
  }
  t('连败≥2 触发率 ≈ 33%（±3%）', Math.abs(cnt / 20000 - 0.33) < 0.03, (cnt / 20000).toFixed(3));

  /* 无连败触发率 ≈ 22% */
  cnt = 0;
  for (let i = 0; i < 20000; i++) {
    const s2 = freshState();
    if (EV.maybeTrigger(s2, { rng: () => i / 20000, now: 1000 })) cnt++;
  }
  t('无连败触发率 ≈ 22%（±3%）', Math.abs(cnt / 20000 - 0.22) < 0.03, (cnt / 20000).toFixed(3));

  /* 被围访中不触发（防连锁） */
  s = freshState(); s.eventDebuffUntil = 999999;
  t('讨债 debuff 期间不触发新事件', EV.maybeTrigger(s, { rng: () => 0, now: 1000 }) === null);

  /* 防重复：推进局数，统计事件多样性 */
  s = freshState();
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    s.stats.rounds = 20 + i;                 /* 每轮推进一局 */
    const e = EV.maybeTrigger(s, { rng: () => (i % 100) / 100, now: 1000 });
    if (e) seen.add(e.id);
  }
  t('200 轮内至少出现 3 种不同事件', seen.size >= 3, [...seen].join(','));
}

section('选项后果');
{
  /* 输光的赌徒：垫付扣资源+关系；赶出去无事；Eidos 处置+关系 */
  let s = freshState(); s.desc = 200; s.bonds.eidos = 0;
  let ev = EV.POOL.find(e => e.id === 'bum_debt');
  let txt = EV.applyChoice(s, ev, 0, 1000);
  t('垫付：desc -20、Eidos +1', s.desc === 180 && s.bonds.eidos === 1, s.desc + '/' + s.bonds.eidos);
  t('垫付：有结果文案', typeof txt === 'string' && txt.length > 10);

  s = freshState(); s.desc = 200;
  txt = EV.applyChoice(s, ev, 1, 1000);
  t('请出去：资源与关系不动', s.desc === 200 && s.bonds.eidos === 0);

  s = freshState();
  EV.applyChoice(s, ev, 2, 1000);
  t('Eidos 处置：关系 +1', s.bonds.eidos === 1);

  /* 出千者：说情 +2 */
  s = freshState();
  ev = EV.POOL.find(e => e.id === 'cheater');
  EV.applyChoice(s, ev, 1, 1000);
  t('替出千者说情：Eidos +2', s.bonds.eidos === 2, s.bonds.eidos);

  /* 醉汉：保安 -10 情绪 */
  s = freshState(); s.mood = 100;
  ev = EV.POOL.find(e => e.id === 'drunk');
  EV.applyChoice(s, ev, 0, 1000);
  t('叫保安：mood -10', s.mood === 90, s.mood);

  /* 催债人：赖 = debuff */
  s = freshState();
  ev = EV.POOL.find(e => e.id === 'debt_collector');
  EV.applyChoice(s, ev, 1, 1000);
  t('赖账：讨债 debuff 2 分钟', s.eventDebuffUntil === 1000 + 120000, s.eventDebuffUntil);
  t('debtActive 生效判定', EV.debtActive(s, 1001) && !EV.debtActive(s, 1000 + 120001));

  /* 午夜：离场清 debuff */
  s = freshState(); s.completedUntil = 999999; s.eventDebuffUntil = 999999;
  ev = EV.POOL.find(e => e.id === 'midnight');
  EV.applyChoice(s, ev, 0, 1000);
  t('午夜离场：清两种 debuff', s.completedUntil === 0 && s.eventDebuffUntil === 0);

  /* Eidos 陪玩：应战 buff + 关系 */
  s = freshState(); s.bonds.eidos = 3;
  ev = EV.POOL.find(e => e.id === 'eidos_play');
  EV.applyChoice(s, ev, 0, 1000);
  t('陪玩应战：下局免费 + Eidos +1', s.nextFreeRound === true && s.bonds.eidos === 4);

  s = freshState(); s.bonds.eidos = 3;
  EV.applyChoice(s, ev, 1, 1000);
  t('陪玩拒绝：Eidos -1', s.bonds.eidos === 2);
}

section('蒙特卡洛：事件可达性与分布');
{
  /* 5000 局连续打，统计各事件触发次数（eidos_play 需先解锁关系） */
  const s = DG.state.createInitial();
  s.desc = 99999; s.mood = 99999;
  s.bonds.eidos = 5;                 /* 预解锁陪玩线 */
  const cnt = {};
  let rounds = 0;
  for (let i = 0; i < 5000 && rounds < 4000; i++) {
    s.stats.rounds = ++rounds;
    const ev = EV.maybeTrigger(s, { now: 1000 + rounds * 1000 });
    if (ev) { cnt[ev.id] = (cnt[ev.id] || 0) + 1; EV.applyChoice(s, ev, 0, 1000 + rounds * 1000); }
  }
  t('4000 局内 5 个闹事事件全部出现过', ['bum_debt', 'cheater', 'drunk', 'debt_collector', 'midnight']
    .every(id => cnt[id] > 0), JSON.stringify(cnt));
  t('陪玩事件也出现过', (cnt.eidos_play || 0) > 0, cnt.eidos_play);
  t('事件总频率合理（4-8 局一次 → 500-1000 次）',
    Object.values(cnt).reduce((a, b) => a + b, 0) > 300 && Object.values(cnt).reduce((a, b) => a + b, 0) < 2000,
    Object.values(cnt).reduce((a, b) => a + b, 0));
  /* 资源不被事件榨干（垫付/维修等消耗 vs 基础持有） */
  t('长线跑资源不破零（99999 持有下）', s.desc > 0, s.desc);
}

console.log('\n========================================');
console.log('事件系统测试：' + pass + ' 通过 / ' + fail + ' 失败');
console.log('========================================');
process.exit(fail ? 1 : 0);
