/* 老虎机（Slots）规则内核——Eidos 赌场（纯逻辑，无 DOM，可 node 测试）
 * 规则基线：3 卷轴单中奖线，加权符号；三连按赔付表，高符号（星星/幸运七）
 * **任意两个**即赔（散对规则，含非相邻；不叠加，三连优先）。低符号两连不赔。
 * 理论 RTP = Σ p³×pay3 + Σ 3p²(1-p)×pay2，实测见测试蒙特卡洛（目标 ≈96%）。
 * Eidos 化：三连七 = 「极点」，赔 300 倍——她笑着说，概率终于公平了一回。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  if (!DG.slots) DG.slots = {};

  var SYMBOLS = [
    { id: 'cherry', icon: '🍒', name: '樱桃',   weight: 28, pay3: 4,   pay2: 0 },
    { id: 'lemon',  icon: '🍋', name: '柠檬',   weight: 24, pay3: 9,   pay2: 0 },
    { id: 'bell',   icon: '🔔', name: '铃铛',   weight: 19, pay3: 18,  pay2: 0 },
    { id: 'gem',    icon: '💎', name: '宝石',   weight: 14, pay3: 45,  pay2: 0 },
    { id: 'star',   icon: '⭐', name: '星星',   weight: 9,  pay3: 120, pay2: 5 },
    { id: 'seven',  icon: '7️⃣', name: '幸运七', weight: 6,  pay3: 400, pay2: 14 }
  ];
  var TOTAL_W = 0, BY_ID = {};
  for (var i = 0; i < SYMBOLS.length; i++) { TOTAL_W += SYMBOLS[i].weight; BY_ID[SYMBOLS[i].id] = SYMBOLS[i]; }
  DG.slots.SYMBOLS = SYMBOLS;
  DG.slots.TOTAL_W = TOTAL_W;

  function byId(id) { return BY_ID[id]; }
  DG.slots.byId = byId;

  /* 加权抽一符：rng 可注入（测试确定性） */
  function drawOne(rng) {
    var roll = rng() * TOTAL_W, acc = 0;
    for (var i = 0; i < SYMBOLS.length; i++) {
      acc += SYMBOLS[i].weight;
      if (roll < acc) return SYMBOLS[i];
    }
    return SYMBOLS[SYMBOLS.length - 1];
  }
  DG.slots.drawOne = drawOne;

  /* 一次旋转：返回 {reels:[sym×3], kind:'three'|'pair'|'none', symbol, mult}。
   * mult 为净赔倍数（本金另计）：中奖时资源入账 bet × mult，未中奖 -bet。 */
  function spin(rng) {
    rng = rng || Math.random;
    var reels = [drawOne(rng), drawOne(rng), drawOne(rng)];
    if (reels[0].id === reels[1].id && reels[1].id === reels[2].id) {
      return { reels: reels, kind: 'three', symbol: reels[0], mult: reels[0].pay3 };
    }
    var counts = {};
    for (var i = 0; i < 3; i++) counts[reels[i].id] = (counts[reels[i].id] || 0) + 1;
    for (var id in counts) {
      if (counts[id] === 2 && BY_ID[id].pay2 > 0) {
        return { reels: reels, kind: 'pair', symbol: BY_ID[id], mult: BY_ID[id].pay2 };
      }
    }
    return { reels: reels, kind: 'none', symbol: null, mult: 0 };
  }
  DG.slots.spin = spin;

  /* 理论回报率（含本金返还）：三连 p³×(pay3+1) + 恰好两符（任意两位）3p²(1-p)×(pay2+1)。
   * 首次设计曾漏算本金导致表面 96% 实际 104%（赌场倒贴），由蒙特卡洛抓出后调表至 ≈96.4%。 */
  function theoreticalRTP() {
    var sum = 0;
    for (var i = 0; i < SYMBOLS.length; i++) {
      var s = SYMBOLS[i], p = s.weight / TOTAL_W;
      sum += p * p * p * (s.pay3 + 1);
      if (s.pay2 > 0) sum += 3 * p * p * (1 - p) * (s.pay2 + 1);
    }
    return sum;
  }
  DG.slots.theoreticalRTP = theoreticalRTP;
})(typeof window !== 'undefined' ? window : globalThis);
