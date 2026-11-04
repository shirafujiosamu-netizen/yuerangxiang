/* 赌场：Eidos 坐庄，一局流程（选赌注等级 → 开局 → 结果 → 结算）（纯逻辑，无 DOM）
 * 赔率模型：正式值（docs/balance.md 赌场赔率模型）——胜率 45% / 赔率 1.2:1。
 * Eidos「赔率永远公平」：b*=(1-p)/p=1.2222，展示 1.2 一位小数向下取整，舍入即抽水，
 * 庄家优势 1%（玩家 EV=-0.01/注额），30 局期望仅亏约 3 资源，体感完全公平。
 * 赌注三级：描述 → 情绪 → 存在。「存在」档 demo 期只做 UI 与文案，不实删单位。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  DG.casino = {
    /* 正式赔率（docs/balance.md）：winRate 不变，payout 1 -> 1.2 */
    ODDS: { winRate: 0.45, payout: 1.2 },
    COMPLETE_STREAK: 5,        /* 连输至极点：被「完成」的连败阈值 */
    COMPLETE_MS: 60000,        /* 「完成」debuff 持续 60 秒，期间全场产出减半 */

    TIERS: [
      { id: 'desc',  label: '描述', stake: 10, res: 'desc',  demo: false, note: '赌注：10 描述。胜 1:1 / 二十一点 3:2。' },
      { id: 'mood',  label: '情绪', stake: 10, res: 'mood',  demo: false, note: '赌注：10 情绪。胜 1:1 / 二十一点 3:2。' },
      { id: 'being', label: '存在', stake: 0,  res: null,    demo: true,  note: '赌注：一名在驻单位。demo 期仅展示 UI 与文案，不实删单位。' }
    ],

    get: function (id) {
      for (var i = 0; i < DG.casino.TIERS.length; i++) if (DG.casino.TIERS[i].id === id) return DG.casino.TIERS[i];
      return null;
    },

    canStart: function (s, tierId) {
      var t = DG.casino.get(tierId);
      if (!t) return { ok: false, err: '赌注等级不存在' };
      if (t.demo) return { ok: true, demo: true };
      if (s[t.res] < t.stake) return { ok: false, err: (t.res === 'desc' ? '描述' : '情绪') + '不足（需要 ' + t.stake + '）' };
      return { ok: true };
    },

    /* 开局：扣除赌注。返回 {ok, err, tier} */
    start: function (s, tierId) {
      var chk = DG.casino.canStart(s, tierId);
      if (!chk.ok) return chk;
      var t = DG.casino.get(tierId);
      if (!t.demo) s[t.res] -= t.stake;
      s.stats.rounds++;
      return { ok: true, tier: t };
    },

    /* 结算：rng / now 可注入。返回 {win, roll, delta, demo, text, streak, completed, completionText} */
    resolve: function (s, tierId, rng, now) {
      rng = rng || Math.random;
      now = now || Date.now();
      var t = DG.casino.get(tierId);
      if (!t) return { ok: false, err: '赌注等级不存在' };
      var roll = Math.floor(rng() * 100);
      if (t.demo) {
        return {
          ok: true, demo: true, win: roll < DG.casino.ODDS.winRate * 100, roll: roll, delta: 0,
          text: '存在档已开盘。但 demo 期间，庄家拒收这个赌注——你的单位们仍在册。',
          streak: s.stats.lossStreak
        };
      }
      var win = roll < DG.casino.ODDS.winRate * 100;
      var delta = 0, completed = false, completionText = null;
      if (win) {
        /* 开局已扣赌注，赢则退回赌注 + 净赚 stake × payout */
        var profit = t.stake * DG.casino.ODDS.payout;
        s[t.res] += t.stake + profit;
        delta = profit;
        s.stats.wins++;
        s.stats.lossStreak = 0;
      } else {
        s.stats.lossStreak++;
        if (s.stats.lossStreak >= DG.casino.COMPLETE_STREAK) {
          /* 连输至极点：被「完成」。完美，但不再说话。debuff 生效后连败清零重计。 */
          completed = true;
          s.completedUntil = now + DG.casino.COMPLETE_MS;
          s.stats.lossStreak = 0;
          completionText = '连败至此，你已被「完成」——完美，且不再说话。备注：产出减半，持续 '
            + (DG.casino.COMPLETE_MS / 1000) + ' 秒。';
        }
      }
      return {
        ok: true, demo: false, win: win, roll: roll, delta: delta,
        text: win ? ('掷出 ' + roll + '。你赢了：收回赌注，净赚 ' + delta + (t.res === 'desc' ? ' 描述' : ' 情绪') + '。')
                  : ('掷出 ' + roll + '。你输了，付掉 ' + t.stake + (t.res === 'desc' ? ' 描述' : ' 情绪') + '。'),
        streak: s.stats.lossStreak, completed: completed, completionText: completionText
      };
    },

    /* 通用结算入账：把一局净额并回资源与统计（二十一点/轮盘/老虎机共用）。
     * net 为该局资源净变化（赌注已在开局扣除）：net>0 计胜，net<0 计连败；
     * 连输达 COMPLETE_STREAK 触发「完成」debuff。demo 档不动资源。
     * 返回 {delta, win, completed, completionText} */
    applyOutcome: function (s, tier, net, now) {
      now = now || Date.now();
      var completed = false, completionText = null;
      if (!tier || tier.demo) return { delta: 0, win: net > 0, completed: false, completionText: null };
      s[tier.res] += net;
      if (net > 0) { s.stats.wins++; s.stats.lossStreak = 0; }
      else if (net < 0) {
        s.stats.lossStreak++;
        if (s.stats.lossStreak >= DG.casino.COMPLETE_STREAK) {
          completed = true;
          s.completedUntil = now + DG.casino.COMPLETE_MS;
          s.stats.lossStreak = 0;
          completionText = '连败至此，你已被「完成」——完美，且不再说话。备注：产出减半，持续 '
            + (DG.casino.COMPLETE_MS / 1000) + ' 秒。';
        }
      }
      return { delta: net, win: net > 0, completed: completed, completionText: completionText };
    },

    /* debuff 状态查询：是否处于「完成」中 */
    isCompleted: function (s, now) { return (s.completedUntil || 0) > (now || Date.now()); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
