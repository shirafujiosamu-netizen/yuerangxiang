/* 技能树：8 节点 / 2 分支，点技能消耗「描述」（纯逻辑，无 DOM）
 * 分支 A · 档案扩编（收容格与描述产出）；分支 B · 污染处置（污染增速与压制）。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});

  DG.skills = {
    BRANCHES: {
      A: { name: '分支 A · 档案扩编', desc: '收容格与「描述」产出' },
      B: { name: '分支 B · 污染处置', desc: '污染增速、压制与失效善后' }
    },
    NODES: [
      { id: 'a1', branch: 'A', row: 0, name: '基础归档', cost: 10,  requires: null, effect: '收容格 +2（6 → 8）' },
      { id: 'a2', branch: 'A', row: 1, name: '索引优化', cost: 25,  requires: 'a1', effect: '「描述」产出 +25%' },
      { id: 'a3', branch: 'A', row: 2, name: '深度著录', cost: 60,  requires: 'a2', effect: '「描述」产出再 +50%' },
      { id: 'a4', branch: 'A', row: 3, name: '无限柜',   cost: 150, requires: 'a3', effect: '收容格 +3（8 → 11）' },
      { id: 'b1', branch: 'B', row: 0, name: '日常消杀', cost: 10,  requires: null, effect: '全局污染增速 -20%' },
      { id: 'b2', branch: 'B', row: 1, name: '隔离规程', cost: 25,  requires: 'b1', effect: '压制效果 +50%' },
      { id: 'b3', branch: 'B', row: 2, name: '深井填埋', cost: 60,  requires: 'b2', effect: '污染自然衰减 0.2/秒' },
      { id: 'b4', branch: 'B', row: 3, name: '灭门预案', cost: 150, requires: 'b3', effect: '失效后污染回落至 20，宽限期 60 秒' }
    ],

    get: function (id) {
      for (var i = 0; i < DG.skills.NODES.length; i++) if (DG.skills.NODES[i].id === id) return DG.skills.NODES[i];
      return null;
    },

    /* 由已购技能汇总出修正值 */
    modifiers: function (s) {
      var sk = s.skills || {};
      return {
        descMult: (sk.a2 ? 1.25 : 1) * (sk.a3 ? 1.5 : 1),
        moodMult: 1,
        pollutionMult: sk.b1 ? 0.8 : 1,
        decay: sk.b3 ? 0.2 : 0,
        suppressPower: sk.b2 ? 37.5 : 25,   /* 25 * 1.5 */
        suppressDuration: 30000,
        breachReset: sk.b4 ? 20 : 35,
        breachGrace: sk.b4 ? 60000 : 30000
      };
    },

    canBuy: function (s, id) {
      var n = DG.skills.get(id);
      if (!n) return { ok: false, err: '节点不存在' };
      if (s.skills[id]) return { ok: false, err: '已录入' };
      if (n.requires && !s.skills[n.requires]) return { ok: false, err: '需要先录入「' + DG.skills.get(n.requires).name + '」' };
      if (s.desc < n.cost) return { ok: false, err: '描述不足（需要 ' + n.cost + '）' };
      return { ok: true };
    },

    buy: function (s, id) {
      var chk = DG.skills.canBuy(s, id);
      if (!chk.ok) return chk;
      var n = DG.skills.get(id);
      s.desc -= n.cost;
      s.skills[id] = true;
      if (id === 'a1') { s.cells.push(DG.state.blankCell(), DG.state.blankCell()); }
      if (id === 'a4') { s.cells.push(DG.state.blankCell(), DG.state.blankCell(), DG.state.blankCell()); }
      return { ok: true, node: n };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
