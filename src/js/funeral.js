/* 门面 · 殡仪馆（完人之门开局）——纯逻辑，无 DOM
 *
 * 一条丧事 = 收尸 → 洗身 → 穿衣 → 念辞 → 出殡，五步各选一次。
 * 每次选择只动四样东西：体面（dignity）、钱、口碑、与未型的关系。
 * 五步走完结算：钱照预算发，口碑照体面浮动。
 *
 * 剧情门（demo 主干）：
 *   做完 3 单 → 九月开学（大学）→ 遇见未型 → 陪他去赌 → 赌场请玩家做托 → demo 收尾。
 *
 * 设计口径（docs/game-design.md v6）：
 *   - 现实邪教产业链：先有个能收钱的门面，再把人和钱往上供。
 *   - 势力各自独立开局，不混线；此处只管完人之门。
 *   - Sylvain 不是玩家，不复用他的故事。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  /* 五个门面。open=false 的是还没开工的，点上去只留一句话，不给假按钮。 */
  var FACTIONS = [
    { id: 'wanren', name: '完人之门', god: '未型 / Eidos', shop: '殡仪馆', open: true },
    { id: 'quanneng', name: '全能之门', god: '无限（Ótakmarkað）', shop: '旧书店 · 档案', open: false },
    { id: 'weizhi', name: '未知信仰', god: 'Ω', shop: '酒馆 · 猫径 Catway', open: false },
    { id: 'yizu', name: '壹祖', god: '壹祖 / 遗祖', shop: '寺庙', open: false },
    { id: 'shizong', name: '势宗', god: 'Euthanasie', shop: '面馆', open: false }
  ];

  var STEPS = [
    { id: 'receive', name: '收尸' },
    { id: 'wash', name: '洗身' },
    { id: 'dress', name: '穿衣' },
    { id: 'eulogy', name: '念辞' },
    { id: 'burial', name: '出殡' }
  ];

  /* 五步的选择。d = 后果增量 {dig 体面, money 钱, rep 口碑, bond 未型}
   * cond(order) 可选，不满足则该选项不出现。 */
  var CHOICES = {
    receive: [
      {
        id: 'rule', text: '照规矩来：洗手、正衣、抬上车',
        d: { dig: 4, money: 0, rep: 1, bond: 0 },
        out: '你按规矩走了一遍，手上没有多余的动作。殡仪馆这行，最贵的是不慌。'
      },
      {
        id: 'check', text: '先掀开白布看一眼',
        d: { dig: 8, money: 0, rep: 0, bond: 1 },
        out: '你掀开一角。看清楚了，才知道后面几步该给谁体面。'
      },
      {
        id: 'rush', text: '催着工人快些，后面还有一单',
        d: { dig: -10, money: 60, rep: -2, bond: 0 },
        out: '车来得很快。担架磕在门槛上，响了一声，家属在院里听见了。'
      }
    ],
    wash: [
      {
        id: 'own', text: '自己动手，一寸一寸洗',
        d: { dig: 10, money: 0, rep: 2, bond: 1 },
        out: '水换了三盆。做完这件事，你和这具身体之间就有了点交情，虽然只到今天。'
      },
      {
        id: 'worker', text: '交给工人，你在旁边看着',
        d: { dig: 2, money: 0, rep: 0, bond: 0 },
        out: '工人手很快，也很干净。你站在门口，看水顺着地漏走。'
      },
      {
        id: 'perfume', text: '拿香精盖一盖味道',
        d: { dig: -6, money: 20, rep: -1, bond: 0 },
        out: '屋里香得厉害。开门通风的时候，家属问你：是不是出什么事了。'
      }
    ],
    dress: [
      {
        id: 'own_clothes', text: '穿他自己带来的衣服',
        d: { dig: 8, money: 0, rep: 1, bond: 0 },
        out: '衣服洗过，袖口磨得起毛。你把它拉直，扣好最上面那颗。'
      },
      {
        id: 'shop_suit', text: '取柜里那套寿衣，最体面的',
        d: { dig: 6, money: -80, rep: 2, bond: 0 },
        out: '缎面上绣着折枝。家属摸了摸，说这个人一辈子没穿过这样的衣裳。'
      },
      {
        id: 'cheap', text: '用仓库里那批旧的',
        d: { dig: -8, money: 40, rep: -2, bond: 0 },
        out: '衣服有点大，肩线塌下去。你替他往上提了两次，还是塌。'
      }
    ],
    eulogy: [
      {
        id: 'script', text: '照本子念：一生辛劳，福泽后人',
        d: { dig: 0, money: 0, rep: 1, bond: 0 },
        out: '本子是死的，念得稳。念完抬头，屋里的人在点头。'
      },
      {
        id: 'write', text: '现写一段，写他真正做过的事',
        d: { dig: 12, money: 0, rep: 3, bond: 1 },
        out: '你写了他修过的水管、养大的两个孩子、某年冬天没舍得买的那双鞋。'
          + '念到一半有人哭了，哭得很不体面，但很对。'
      },
      {
        id: 'family', text: '把话头让给家属',
        d: { dig: 6, money: 0, rep: 0, bond: 0 },
        out: '大儿子张了张嘴，什么也没说出来。二女儿接过去，说了七分钟。'
      },
      {
        id: 'eidos', text: '问一声：能不能更好一点',
        d: { dig: 4, money: 0, rep: 0, bond: 2 },
        out: '话一出口，你自己愣了一下。「更好」这两个字最近老在你嘴边。'
          + '没有人回答，但灵堂里的灯，好像亮了一点。',
        cond: function (s) { return DG.funeral.bond(s) >= 1; }
      }
    ],
    burial: [
      {
        id: 'plain', text: '按单子上的流程走完',
        d: { dig: 4, money: 0, rep: 1, bond: 0 },
        out: '车出巷口，纸钱落在湿地上，很快被车轮带走。'
      },
      {
        id: 'extra', text: '自掏腰包加一程，送到山门',
        d: { dig: 10, money: -60, rep: 3, bond: 1 },
        out: '多走了二十里。家属在车上一直说不用，你一直没停。'
      },
      {
        id: 'cut', text: '半路把人交出去，省一趟车',
        d: { dig: -12, money: 80, rep: -3, bond: 0 },
        out: '交接在岔路口。你回头看见白布被风掀了一下，又被按回去。'
      }
    ]
  };

  /* 死者名册：普通 NPC，不用 OC。purse 是家属给的预算。 */
  var POOL = [
    { name: '周三德', age: 78, cause: '肺上的老毛病', kin: '两个儿子，一个在外地',
      demand: '「按老家的规矩，停三天。」', purse: 900, kind: 'plain' },
    { name: '林巧', age: 34, cause: '夜里加班回来的路上', kin: '一个不到六岁的女儿，和一个不说话的男人',
      demand: '「孩子要见最后一面。」', purse: 600, kind: 'young' },
    { name: '许国梁', age: 61, cause: '酒', kin: '都输光了的人，朋友来得比亲戚多',
      demand: '「办得响一点，他这辈子就爱热闹。」', purse: 1500, kind: 'loud' },
    { name: '沈老师', age: 83, cause: '睡着没醒', kin: '教过的学生来了一屋子',
      demand: '「别搞那些排场，说说话就行。」', purse: 700, kind: 'plain' },
    { name: '吴慧珍', age: 52, cause: '厂里那台机器', kin: '厂里来了三个代表，赔的钱还没谈下来',
      demand: '「我们没钱，但他不能被糊弄过去。」', purse: 400, kind: 'poor' },
    { name: '不知名的男人', age: 40, cause: '身上没有任何证件', kin: '没有人来',
      demand: '「……」', purse: 0, kind: 'nameless' },
    { name: '小满', age: 9, cause: '一场没来得及说清楚的病', kin: '母亲一个人来的，手里攥着一张照片',
      demand: '「能不能让她穿着裙子走。」', purse: 500, kind: 'young' }
  ];

  var STORY_ORDERS_FOR_UNIVERSITY = 3;

  function def() {
    return {
      faction: null,      /* null = 还没选；wanren = 殡仪馆 */
      money: 0,
      rep: 50,
      ordersDone: 0,
      active: null,       /* { order, step, dig, log: [] } */
      stage: 'pick',      /* pick → shop → university → eidos → casino → end */
      log: [],            /* 丧事流水（结算过的） */
      poolUsed: []        /* 已用过的名册下标 */
    };
  }

  /* 老档补齐：state.migrate 只管顶层的字段，门面数据在这里兜底 */
  function ensure(s) {
    if (!s.funeral || typeof s.funeral !== 'object') s.funeral = def();
    var f = s.funeral, d = def();
    for (var k in d) if (f[k] === undefined) f[k] = d[k];
    if (!Array.isArray(f.log)) f.log = [];
    if (!Array.isArray(f.poolUsed)) f.poolUsed = [];
    if (f.active && (!f.active.order || !Array.isArray(f.active.log))) f.active = null;
    if (!s.bonds || typeof s.bonds !== 'object') s.bonds = { eidos: 0 };
    if (s.bonds.eidos === undefined) s.bonds.eidos = 0;
    return f;
  }

  function bond(s) { return (s.bonds && s.bonds.eidos) || 0; }

  function factionById(id) {
    for (var i = 0; i < FACTIONS.length; i++) if (FACTIONS[i].id === id) return FACTIONS[i];
    return null;
  }

  /* 选门面。只有开门的能选，其余返回明确错误，不做假按钮。 */
  function pickFaction(s, id) {
    var f = ensure(s);
    var def2 = factionById(id);
    if (!def2) return { ok: false, err: '没有这个门面' };
    if (!def2.open) return { ok: false, err: def2.name + '还没开工，这条线还空着' };
    f.faction = id;
    f.stage = 'shop';
    return { ok: true, faction: def2 };
  }

  /* 抽一单。遍历名册挑没用过的；全用完就从头再来（rng 可注入）。 */
  function drawOrder(s, rng) {
    var f = ensure(s);
    var r = rng || Math.random;
    var free = [];
    for (var i = 0; i < POOL.length; i++) if (f.poolUsed.indexOf(i) < 0) free.push(i);
    if (!free.length) { f.poolUsed = []; for (i = 0; i < POOL.length; i++) free.push(i); }
    var idx = free[Math.min(free.length - 1, Math.floor(r() * free.length))];
    f.poolUsed.push(idx);
    var tpl = POOL[idx];
    return {
      id: 'ord' + (f.ordersDone + 1) + '_' + idx,
      name: tpl.name, age: tpl.age, cause: tpl.cause, kin: tpl.kin,
      demand: tpl.demand, purse: tpl.purse, kind: tpl.kind
    };
  }

  /* 接单：进入五步流程 */
  function startOrder(s, rng) {
    var f = ensure(s);
    if (f.faction !== 'wanren') return { ok: false, err: '还没开门' };
    if (f.active) return { ok: false, err: '手上还有一单没做完' };
    var order = drawOrder(s, rng);
    f.active = { order: order, step: 0, dig: 50, money: 0, log: [] };
    return { ok: true, order: order, step: STEPS[0] };
  }

  function currentStep(f) {
    if (!f.active) return null;
    return STEPS[f.active.step] || null;
  }

  /* 当前这一步可选的选项（过滤 cond） */
  function choicesFor(s, stepId) {
    var list = CHOICES[stepId] || [];
    return list.filter(function (c) {
      if (!c.cond) return true;
      try { return !!c.cond(s); } catch (e) { return false; }
    });
  }

  /* 选一个。返回 {ok, out, step, done} */
  function choose(s, stepId, choiceId) {
    var f = ensure(s);
    if (!f.active) return { ok: false, err: '现在没有在办的丧事' };
    var cur = currentStep(f);
    if (!cur) return { ok: false, err: '这一单已经走完了' };
    if (cur.id !== stepId) return { ok: false, err: '顺序不对：现在该做「' + cur.name + '」' };
    var list = choicesFor(s, stepId), pick = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === choiceId) pick = list[i];
    if (!pick) return { ok: false, err: '没有这个选项' };
    var d = pick.d || {};
    f.active.dig = DG.util.clamp(f.active.dig + (d.dig || 0), 0, 100);
    f.active.money += (d.money || 0);
    f.rep = DG.util.clamp(f.rep + (d.rep || 0), 0, 100);
    if (d.bond) s.bonds.eidos = Math.max(-9, Math.min(9, bond(s) + d.bond));
    f.active.log.push({ step: stepId, choice: choiceId, text: pick.out });
    f.active.step++;
    var done = f.active.step >= STEPS.length;
    return { ok: true, out: pick.out, step: STEPS[f.active.step] || null, done: done };
  }

  /* 结算：钱按预算 ×（体面/50）发，口碑按体面偏离 50 的幅度浮动。
   * 预算为 0 的单（无名尸）不发钱，但体面照样进账。 */
  function settle(s) {
    var f = ensure(s);
    if (!f.active) return { ok: false, err: '没有可以结算的单' };
    if (f.active.step < STEPS.length) return { ok: false, err: '还没走完五步' };
    var a = f.active, o = a.order;
    var ratio = a.dig / 50;                       /* 体面 50 = 按预算原价 */
    var pay = Math.round(o.purse * ratio) + a.money;   /* a.money 是过程中自己贴/赚的差额 */
    var repDelta = Math.round((a.dig - 50) / 10);
    f.money += pay;
    f.rep = DG.util.clamp(f.rep + repDelta, 0, 100);
    f.ordersDone++;
    var rec = {
      order: o, dig: a.dig, pay: pay, rep: repDelta,
      extras: a.money, at: Date.now()
    };
    f.log.unshift(rec);
    if (f.log.length > 20) f.log.length = 20;
    f.active = null;
    return { ok: true, rec: rec, stage: f.stage };
  }

  /* 剧情门：每完成一单问一次，返回下一个该演的事（没有就 null） */
  function nextStory(s) {
    var f = ensure(s);
    if (f.faction !== 'wanren') return null;
    if (f.active) return null;
    if (f.stage === 'shop' && f.ordersDone >= STORY_ORDERS_FOR_UNIVERSITY) return { id: 'university' };
    if (f.stage === 'eidos') return { id: 'eidos' };
    if (f.stage === 'eidos_ready' && bond(s) >= 1) return { id: 'casino' };
    return null;
  }

  var STORY = {
    university: {
      title: '九月 · 开学',
      text: '九月你还是去报到了。宗教学，课表上写着「仪式与死亡」四个字，'
        + '坐在你旁边的学生把脚架在前排椅背上，白得不像活人。'
        + '下课他问你：你是做殡葬的？那你能不能带我看看，人是怎么被送走的。'
        + '他说他叫未型。名字怪，人倒普通，普通人那种普通。',
      hint: '「完人之门」认这个名字，但你不说破。',
      apply: function (s) {
        var f = ensure(s);
        f.stage = 'eidos';
        s.bonds.eidos = Math.max(bond(s), 1);
        f.log.push({ note: 'university', at: Date.now() });
      }
    },
    eidos: {
      title: '他爱赌',
      text: '未型赌得不坏，也不算好，问题是输了还要再来。'
        + '他赌的时候眼睛很亮，像在验证什么东西到底会不会崩。'
        + '某个晚上他把最后一点钱推上桌，回头看你：「你借我一把，我保证还。」',
      hint: '他说完自己也笑了一下，好像知道这话不可信。',
      apply: function (s) {
        var f = ensure(s);
        f.stage = 'eidos';
        if (bond(s) < 1) s.bonds.eidos = 1;
      }
    },
    casino: {
      title: '赌场来人',
      text: '赌场的人第二天就找上门。来的人很客气，说他们注意到你身边那位客人，'
        + '输得漂亮，赢得也漂亮，客人喜欢看他。'
        + '「我们不缺赌客，缺的是让他一直坐在那里的人。你来做托，赢下的钱分你一份。」'
        + '他临走时补了一句：你那间殡仪馆，我们老板偶尔也用得上。',
      hint: '你答应了。殡仪馆的账上还差一笔。',
      apply: function (s) {
        var f = ensure(s);
        f.stage = 'casino';
        f.demoDone = true;
        /* 合作成立：玩家在赌场做托，赢面抽两成 */
        f.deal = { role: '托', cut: 0.2, since: Date.now() };
      }
    }
  };

  /* 赌场合作是否成立（demo 尾段） */
  function hasDeal(s) {
    var f = ensure(s);
    return !!(f && f.deal);
  }

  /* 演完一段剧情，把 stage 推到下一格（幂等：重复调用不会连跳） */
  function playStory(s, id) {
    var f = ensure(s);
    var item = STORY[id];
    if (!item) return { ok: false, err: '没有这段' };
    item.apply(s);
    if (id === 'university') f.stage = 'eidos';
    if (id === 'eidos') f.stage = 'eidos_ready';
    if (id === 'casino') f.stage = 'end';
    return { ok: true, story: item };
  }

  DG.funeral = {
    FACTIONS: FACTIONS,
    STEPS: STEPS,
    CHOICES: CHOICES,
    POOL: POOL,
    hasDeal: hasDeal,
    STORY: STORY,
    STORY_ORDERS_FOR_UNIVERSITY: STORY_ORDERS_FOR_UNIVERSITY,
    def: def,
    ensure: ensure,
    bond: bond,
    factionById: factionById,
    pickFaction: pickFaction,
    drawOrder: drawOrder,
    startOrder: startOrder,
    currentStep: currentStep,
    choicesFor: choicesFor,
    choose: choose,
    settle: settle,
    nextStory: nextStory,
    playStory: playStory
  };
})(typeof window !== 'undefined' ? window : globalThis);
