/* 事件系统：赌场客人闹事 / 陪玩（纯逻辑，无 DOM）
 * 基准 docs/casino_design.md 2.1-2.5：
 *   - 触发：每局结算后调用 maybeTrigger；间隔 ≥ MIN_ROUNDS 局，基础概率 BASE_P，
 *     连败 ≥2 加权 ×1.5、Eidos 关系 ≥2 加权 ×1.2；debuff 中被围访不触发（防连锁）
 *   - 结构：事件 = { id, type, title, npc, text, weight, cond, choices[] }
 *     选项后果：资源± / 关系± / debuff / buff(下局免费) / rng 判定 / 纯叙事
 *   - 边界（用户 2026-10-22 明确）：OC 角色不做闹事背景板——5 个闹事事件全部普通 NPC，
 *     OC（Eidos）只出现在陪玩钩子里。
 * 关系值 s.bonds：事件选择写入；决定陪玩事件解锁与未来结局分支。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  var MIN_ROUNDS = 4;      /* 事件最小间隔（局） */
  var BASE_P = 0.22;       /* 基础触发概率 */
  var RECENT = 3;          /* 最近 N 个事件不重复 */
  var DEBT_COLLECTOR_MS = 120000;  /* 讨债人常驻 debuff 2 分钟 */

  /* 资源名映射（后果里用 res: 'desc' 简写） */
  function resName(r) { return r === 'desc' ? '描述' : (r === 'mood' ? '情绪' : r); }

  /* 事件池。cond(s) 为可选附加条件；choices 每项 { text, run(s, now) -> 结果文案 } */
  var POOL = [
    {
      id: 'bum_debt', type: 'trouble', weight: 10, npc: '输光的赌徒',
      title: '拍桌子的客人',
      text: '穿旧西装的男人把最后一把筹码推上桌，又输掉。他拍桌站起来，说这家的椅子动了手脚，'
        + '其他客人停下手里的事，看过来。庄家后的影子不动，但你在看她。',
      choices: [
        {
          text: '替他垫付这局',
          run: function (s, now) {
            s.desc -= 20;
            DG.events.bondsAdd(s, 'eidos', 1);
            return '你放了 20 描述在桌上。「他的账，记我。」Eidos 看你一眼：「善良是一种赌注，通常赔率不好。」';
          }
        },
        {
          text: '让人把他请出去',
          run: function (s) {
            return '两个熟脸架着他的胳膊拖出门外。喧闹很快平息，像什么都没发生。椅子没有动过手脚——至少今天没有。';
          }
        },
        {
          text: '让 Eidos 处置',
          run: function (s) {
            DG.events.bondsAdd(s, 'eidos', 1);
            return '她从庄家后走出来，只说了三个字。男人脸上的血色褪得比筹码还快。关门时你注意到：他没付账，但也带走了自己的影子。';
          }
        }
      ]
    },
    {
      id: 'cheater', type: 'trouble', weight: 10, npc: '出千者',
      title: '袖里藏牌的人',
      text: '第三局了，同一个女人每次都赢小钱。她袖口翻飞的姿势太整齐——整齐得像排练过。'
        + '她身后两个熟脸已经按住她的肩。她没反抗，只看着你，等你开口。',
      choices: [
        {
          text: '围观',
          run: function (s) {
            return '熟脸从她袖中抖出三张牌，动作熟练。她耸耸肩：「赌场的规矩，我懂。」被带出去时她甚至理了理头发。你记下了这种手法。';
          }
        },
        {
          text: '替她说情',
          run: function (s) {
            DG.events.bondsAdd(s, 'eidos', 2);
            return '「她赢的是小钱。」Eidos 挑眉——你替一个出千者说情，这很奇怪。「品味不错。」熟脸松开手。她走到你面前，深深看了一眼，没说话。';
          }
        }
      ]
    },
    {
      id: 'drunk', type: 'trouble', weight: 10, npc: '醉汉',
      title: '扔杯子的异乡人',
      text: '外乡口音的醉汉把空杯摔在地上，碎片溅到牌桌边。「再来一把！」他吼，'
        + '「我把这整条街都赌——」他的同乡想拉他，被甩开。',
      choices: [
        {
          text: '叫保安',
          run: function (s) {
            s.mood -= 10;
            return '保安来得很快。醉汉被架出去时还在骂。碎片扫干净了，你心里的什么东西也碎了一点：情绪 -10。';
          }
        },
        {
          text: '自己上去，小赌局定胜负',
          run: function (s, now) {
            var win = (DG.events.roll(now)) < 0.5;
            if (win) {
              s.desc += 25;
              return '一把骰子定胜负。他掷出三点，你掷出五点。他瞪着眼看了很久，突然大笑，拍下钱走人。描述 +25。';
            }
            s.mood -= 15;
            return '一把骰子定胜负。他掷出六点——你掷出一点。他吹着口哨把碎片踢到一边。情绪 -15。';
          }
        },
        {
          text: '放任',
          run: function (s) {
            s.desc -= 15;
            return '你转身回去看牌局。身后传来更大的动静和惊呼。第二天维修单躺在你桌上：描述 -15。有些不管，是要付账的。';
          }
        }
      ]
    },
    {
      id: 'debt_collector', type: 'trouble', weight: 12, npc: '催债人',
      title: '上个月的利息',
      text: '穿灰外套的男人不带酒也不带筹码，径直走到你面前，放下一张折了四折的纸。'
        + '「上个月的利息。」他语气平常得像在报时。「这个月的，下周来收。」',
      choices: [
        {
          text: '还钱',
          run: function (s) {
            s.desc -= 30;
            return '你数清楚数目。他收起纸，微微点头，像一位礼貌的医生。门关上后你才发现手心是潮的：描述 -30。';
          }
        },
        {
          text: '赖',
          run: function (s, now) {
            s.eventDebuffUntil = (now || Date.now()) + DEBT_COLLECTOR_MS;
            return '「下个月再说。」他收起纸走了，步伐一点也不急。接下来两分钟，你会经常「碰巧」在门口遇见他：产出减半，直到他不再来。';
          }
        },
        {
          text: '赌一把抵债',
          run: function (s, now) {
            var win = (DG.events.roll(now + 1)) < 0.45;
            if (win) {
              s.desc += 50;
              return '「赌桌上见。」他真的坐下了，一路输到天亮。那张纸的事，你们谁都没再提。描述 +50。';
            }
            s.desc -= 20;
            return '「赌桌上见。」他赢了一把就起身收工。「利息照算。」纸上的数字多了一行：描述 -20。';
          }
        }
      ]
    },
    {
      id: 'midnight', type: 'trouble', weight: 8, npc: null,
      title: '午夜不对劲',
      text: '连败之后，灯暗了一格。不是停电——是影子多出了一个。'
        + '所有客人都在低头看自己的手，没有人注意到牌桌上多了一副没人摸过的牌。',
      choices: [
        {
          text: '离场',
          run: function (s) {
            s.completedUntil = 0;
            s.eventDebuffUntil = 0;
            return '你走出大门，夜风很正常。回头时灯光如常，影子们各就各位。「完成」的痕迹清除了。';
          }
        },
        {
          text: '硬撑',
          run: function (s, now) {
            var win = (DG.events.roll(now + 2)) < 0.3;
            if (win) {
              s.desc += 100;
              return '你坐下来，摸向那副没人摸过的牌。天亮时你赢了整整一百描述——以及某种不该带出赌场的东西。';
            }
            s.mood -= 20;
            s.completedUntil = (now || Date.now()) + 60000;
            return '你坐下来。牌很凉。你忘了自己有没有说话、有没有眨眼。回过神来灯全亮了：情绪 -20，「完成」ing 60 秒。';
          }
        }
      ]
    },
    {
      id: 'eidos_play', type: 'companion', weight: 14, npc: '未型 / Eidos',
      title: '陪我打一局',
      cond: function (s) { return (s.bonds && s.bonds.eidos) >= 2; },
      text: '打烊后她没走。「陪我打一局。」她说，「规则我定。」'
        + '你注意到今晚她亲自洗牌——这是从未有过的事。',
      choices: [
        {
          text: '应战',
          run: function (s) {
            DG.events.bondsAdd(s, 'eidos', 1);
            s.nextFreeRound = true;
            return '她发牌。你看不见她的暗牌——本来也看不见。但这一局，赌注她请。';
          }
        },
        {
          text: '今天算了',
          run: function (s) {
            DG.events.bondsAdd(s, 'eidos', -1);
            return '「好。」她收起牌，没有不高兴。你出门时听见她在身后轻声说：「下次规则会更贵。」';
          }
        }
      ]
    }
  ];

  DG.events = {
    MIN_ROUNDS: MIN_ROUNDS, BASE_P: BASE_P, RECENT: RECENT, POOL: POOL,
    resName: resName,

    /* 可注入的判定随机源（测试替换）；默认挂 Math.random */
    roll: function (x) { return Math.random(); },

    bondsGet: function (s, id) { return (s.bonds && s.bonds[id]) || 0; },
    bondsAdd: function (s, id, n) {
      if (!s.bonds) s.bonds = { eidos: 0 };
      s.bonds[id] = (s.bonds[id] || 0) + n;
      return s.bonds[id];
    },

    /* 事件 debuff 是否生效（讨债人常驻；与「完成」debuff 同机制：产出减半） */
    debtActive: function (s, now) { return (s.eventDebuffUntil || 0) > (now || Date.now()); },

    /* 每局结算后调用。ctx = { rng?, now? }。返回触发的事件（深拷贝，防改池）或 null。 */
    maybeTrigger: function (s, ctx) {
      ctx = ctx || {};
      var now = ctx.now || Date.now();
      var rng = ctx.rng || Math.random;
      if (DG.events.debtActive(s, now)) return null;         /* 被围访中不触发（防连锁） */
      var since = (s.stats.rounds || 0) - (s.lastEventRound || 0);
      if (since < MIN_ROUNDS) return null;
      var p = BASE_P;
      if ((s.stats.lossStreak || 0) >= 2) p *= 1.5;          /* 连败加权：屋漏偏逢连夜雨 */
      if (DG.events.bondsGet(s, 'eidos') >= 2) p *= 1.2;     /* 关系深了故事多 */
      if (rng() > p) return null;
      /* 过滤：cond 不满足 / 最近 RECENT 个已触发 */
      var recent = (s.lastEventIds || []);
      var cands = POOL.filter(function (e) {
        if (recent.indexOf(e.id) >= 0) return false;
        return e.cond ? e.cond(s) : true;
      });
      if (!cands.length) cands = POOL.filter(function (e) { return !e.cond || e.cond(s); });
      if (!cands.length) return null;
      var totalW = cands.reduce(function (a, e) { return a + e.weight; }, 0);
      var pick = rng() * totalW, acc = 0, chosen = cands[cands.length - 1];
      for (var i = 0; i < cands.length; i++) {
        acc += cands[i].weight;
        if (pick < acc) { chosen = cands[i]; break; }
      }
      s.lastEventRound = s.stats.rounds || 0;
      s.lastEventIds = (recent.concat([chosen.id])).slice(-RECENT);
      /* 浅拷贝（choices 共享引用，保住 run 函数；调用方只读） */
      return {
        id: chosen.id, type: chosen.type, title: chosen.title, npc: chosen.npc,
        text: chosen.text, weight: chosen.weight, choices: chosen.choices
      };
    },

    /* 应用选项：返回结果文案（资源/关系/debuff 已写入 s） */
    applyChoice: function (s, ev, idx, now) {
      now = now || Date.now();
      var ch = ev.choices[idx];
      if (!ch) return null;
      return ch.run(s, now);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
