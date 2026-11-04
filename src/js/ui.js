/* UI 层：视图渲染 / 弹窗 / 日志 / 看板台词（依赖 DOM，仅浏览器运行）
 * 所有用户数据字符串经 escapeHtml 转义；点击用事件委托，重渲染不丢绑定。
 */
(function (root) {
  var DG = root.DG || (root.DG = {});
  var E = DG.util.escapeHtml;
  var OTAC_ID = 'oc_otak';   /* Ótakmarkað（无限） */
  var EIDOS_ID = 'dk_eidos'; /* 未型 / Eidos */
  var ART_OTAK = '../art/otakmarkad/otak_placeholder.png';
  var ART_EIDOS = '../art/eidos/eidos_casino_placeholder.png';

  /* 各游戏规则说明（game-tabs 上方 odds-note） */
  var GAME_RULES = {
    bj: '规则：单副牌靴 · 庄家软 17 停 · 二十一点赔 3:2 · 和局退注 · 加倍限首两张。',
    roulette: '规则：欧式单零轮盘 · 直号赔 35:1 · 红黑/奇偶/大小 1:1 · 打数与列 2:1 · 0 落袋外围全灭（庄家优势 2.70%）。',
    slots: '规则：3 卷轴单线 · 三连按赔付表 · 星星与幸运七任意两个即赔（不叠加，三连优先）· 理论回报 96.4%。',
    sicbo: '规则：三粒骰子 · 大/小 1:1（围骰通杀）· 点数最高 68:1 · 单骰出现 1/2/3 次赔 1:1/2:1/12:1 · 围骰 206:1 · 全场庄家优势 1.6%-4.2%。',
    baccarat: '规则：8 副靴 · 闲 0-5 补、庄按标准表补 · 例牌 8/9 · 闲 1:1 / 庄 1:1 抽 5% 佣 / 和 8:1 · 押庄庄家优势 1.06%。'
  };

  /* 账本里的赌桌名（house.js 的 table id → 中文） */
  var TABLE_LABEL = { bj: '二十一点', roulette: '轮盘', slots: '老虎机', sicbo: '骰宝', baccarat: '百家乐' };

  DG.ui = {
    game: null,
    view: 'compartment',
    archiveLog: [],
    casinoLog: [],
    otakQuoteIdx: -1,
    idleShown: false,
    lastInput: Date.now(),
    rosterFilter: { world: '全部世界', rarity: '全部' },
    casino: {
      tier: null,          /* 赌注等级（资源档）：desc / mood / being */
      game: 'bj',          /* 当前游戏页签：bj | roulette | slots | sicbo | baccarat */
      chip: 10,            /* 筹码面额（轮盘/老虎机/骰宝）：10 / 50 / 100 */
      dealerLine: '',
      /* 各游戏结果分槽存放（键 = 页签 id），避免切换页签时文案串台 */
      res: {
        bj: { status: '', result: '', resultCls: '' },
        roulette: { status: '', result: '', resultCls: '' },
        slots: { status: '', result: '', resultCls: '' },
        sicbo: { status: '', result: '', resultCls: '' },
        baccarat: { status: '', result: '', resultCls: '' }
      },
      bj: null,
      rl: { bets: {}, pocket: null, history: [] },   /* bets: {betId: 累计筹码} */
      sl: { reels: null, history: [] },
      sb: { bets: {}, roll: null, history: [] },    /* 骰宝：bets={areaId:筹码} */
      bc: { shoe: null, bets: {}, round: null, history: [] },  /* 百家乐：shoe 跨局连续 */
      event: null          /* 当前弹出的事件（modalEvent 消费） */
    },
    IDLE_LINE: '你还在啊。',
    IDLE_MS: 60000,

    /* ---------- 初始化 ---------- */
    init: function (game) {
      this.game = game;
      this.$view = document.getElementById('view');
      var self = this;
      var navs = document.querySelectorAll('.nav-btn');
      Array.prototype.forEach.call(navs, function (b) {
        b.addEventListener('click', function () { self.setView(b.getAttribute('data-view')); });
      });
      document.addEventListener('click', function (e) { self.onClick(e); });
      document.addEventListener('change', function (e) { self.onChange(e); });
      this.renderAll();
    },

    /* ---------- 视图切换 ---------- */
    setView: function (v) {
      this.view = v;
      var navs = document.querySelectorAll('.nav-btn');
      Array.prototype.forEach.call(navs, function (b) {
        b.classList.toggle('active', b.getAttribute('data-view') === v);
      });
      this.renderAll();
      this.otakQuote(); /* 切换界面：轮播一句 Ótakmarkað 的台词 */
    },

    renderAll: function () {
      this.renderHud();
      if (this.view === 'compartment') this.renderCompartment();
      else if (this.view === 'skilltree') this.renderSkilltree();
      else if (this.view === 'casino') this.renderCasino();
      else if (this.view === 'business') this.renderBusiness();
    },

    /* ---------- HUD ---------- */
    renderHud: function () {
      var s = this.game, now = Date.now();
      document.getElementById('hud-desc').textContent = String(Math.floor(s.desc));
      document.getElementById('hud-mood').textContent = String(Math.floor(s.mood));
      var p = Math.max(0, Math.min(100, s.pollution));
      document.getElementById('pollution-fill').style.width = p.toFixed(1) + '%';
      var rate = DG.pollution.rate(s, now);
      var sup = DG.pollution.isSuppressed(s, now) ? '（压制中）' : '';
      document.getElementById('hud-pollution').textContent = Math.floor(p) + '% ' + sup + ' +' + DG.util.fmt1(rate) + '/s';
      /* 「完成」debuff 提示：生效期间全场产出减半 */
      var comp = document.getElementById('hud-completed');
      if (comp) {
        if (DG.casino.isCompleted(s, now)) {
          comp.style.display = '';
          document.getElementById('hud-completed-val').textContent =
            '产出减半（剩余 ' + Math.ceil((s.completedUntil - now) / 1000) + 's）';
        } else {
          comp.style.display = 'none';
        }
      }
    },

    /* ---------- 厢体 ---------- */
    renderCompartment: function () {
      var s = this.game, now = Date.now();
      var occ = 0, i;
      for (i = 0; i < s.cells.length; i++) if (s.cells[i].unitId) occ++;
      var h = '<div class="panel"><div class="panel-head"><h2>厢体 · 收容格'
        + '<span class="dim">' + occ + ' / ' + s.cells.length + ' 在驻（上限 ' + DG.MAX_CELLS + '）</span></h2>'
        + '<div class="actions">'
        + '<button class="btn primary" data-act="contain-open">＋ 收容</button>'
        + '<button class="btn danger" data-act="suppress">压制（-20 情绪）</button>'
        + '</div></div><div class="cell-grid">';

      for (i = 0; i < s.cells.length; i++) h += this.cellHtml(s.cells[i], i, now);
      for (i = s.cells.length; i < DG.MAX_CELLS; i++) {
        h += '<div class="cell locked">未解锁<span class="cell-arch">技能树 · 基础归档 / 无限柜</span></div>';
      }
      h += '</div></div>';

      h += '<div class="panel"><div class="panel-head"><h2>档案日志</h2></div><ul class="log">';
      for (i = 0; i < this.archiveLog.length; i++) {
        h += '<li class="' + (this.archiveLog[i].cruel ? 'cruel' : '') + '"><span class="t">[' + E(this.archiveLog[i].t) + ']</span>' + E(this.archiveLog[i].text) + '</li>';
      }
      h += '</ul></div>';
      this.$view.innerHTML = h;
    },

    cellHtml: function (c, idx, now) {
      if (!c.unitId) {
        return '<div class="cell empty">空格<div class="cell-actions"><button class="btn small" data-act="contain-open">收容</button></div></div>';
      }
      var u = DG.archive.byId(c.unitId);
      if (!u) return '<div class="cell locked">档案缺失</div>';
      var o = DG.state.unitOutput(this.game, c, now);
      var halted = c.haltedUntil > now;
      var rates = [];
      if (o.desc > 0) rates.push('描述 +' + DG.util.fmt1(o.desc) + '/s');
      if (o.mood > 0) rates.push('情绪 +' + DG.util.fmt1(o.mood) + '/s');
      if (!rates.length) rates.push(halted ? '产出冻结至 ' + new Date(c.haltedUntil).toTimeString().slice(0, 8) : '无产出');
      var poll = u.pollution * (DG.RARITY_MULT[c.rarity] || 1) * 0.05;
      return '<div class="cell unit' + (halted ? ' halted' : '') + '" style="--uc:' + E(u.color) + '">'
        + (halted ? '<div class="cell-tag">冻结中</div>' : '')
        + '<div class="cell-top"><span class="rarity ' + E(c.rarity) + '">' + E(c.rarity) + '</span>'
        + '<span>№' + ('00' + (idx + 1)).slice(-3) + '</span></div>'
        + '<div class="cell-name">' + E(u.name) + '</div>'
        + '<div class="cell-arch">' + E(u.archetype) + '</div>'
        + '<div class="cell-stats">' + rates.map(E).join('<br>')
        + '<br><span class="pollution-line">污染 +' + DG.util.fmt1(poll) + '/s</span></div>'
        + '<div class="cell-actions"><button class="btn small danger" data-act="cell-remove" data-idx="' + idx + '">调离</button></div>'
        + '</div>';
    },

    doSuppress: function () {
      var r = DG.pollution.suppress(this.game, Date.now());
      if (!r.ok) { this.notify(r.err); return; }
      this.log('压制执行：污染度 ' + Math.floor(r.before) + '% → ' + Math.floor(r.after) + '%，此后 30 秒污染增速减半。');
      this.notify('已压制：污染度 -' + Math.floor(r.before - r.after) + '%');
      this.renderAll();
    },

    /* ---------- 门面 · 殡仪馆 ---------- */

    /* 完人之门的开局界面。没选门面先给五张牌，只有开工的能按。 */
    renderBusiness: function () {
      var s = this.game;
      var f = DG.funeral.ensure(s);
      var h = '';

      if (!f.faction) {
        h += '<div class="panel"><div class="panel-head"><h2>门面'
          + '<span class="dim">先有个能收钱的地方，再把人和钱往上供</span></h2></div>'
          + '<div class="faction-grid">';
        DG.funeral.FACTIONS.forEach(function (x) {
          h += '<div class="faction-card' + (x.open ? '' : ' closed') + '"'
            + (x.open ? ' data-act="faction-pick" data-id="' + x.id + '"' : '') + '>'
            + '<div class="fc-name">' + E(x.name) + '</div>'
            + '<div class="fc-god">供奉：' + E(x.god) + '</div>'
            + '<div class="fc-shop">' + E(x.shop) + '</div>'
            + '<div class="fc-state">' + (x.open ? '开门' : '还没开工') + '</div>'
            + '</div>';
        });
        h += '</div></div>';
        this.$view.innerHTML = h;
        return;
      }

      var fac = DG.funeral.factionById(f.faction) || { name: '门面', shop: '' };
      h += '<div class="panel"><div class="panel-head"><h2>' + E(fac.shop)
        + '<span class="dim">' + E(fac.name) + ' · 供奉 ' + E(fac.god) + '</span></h2>'
        + '<div class="actions"><span class="money">钱 ' + f.money
        + ' · 口碑 ' + f.rep + ' · 已办 ' + f.ordersDone + ' 单</span></div></div>';

      var story = DG.funeral.nextStory(s);
      if (story) {
        var st = DG.funeral.STORY[story.id];
        if (st) {
          h += '<div class="story-box"><div class="story-title">' + E(st.title) + '</div>'
            + '<p class="story-text">' + E(st.text) + '</p>'
            + (st.hint ? '<p class="story-hint">' + E(st.hint) + '</p>' : '')
            + '<button class="btn primary" data-act="story-play" data-id="' + story.id + '">继续</button></div>';
        }
      }

      if (DG.funeral.hasDeal(s)) {
        h += '<div class="story-box deal"><div class="story-title">合作 · 赌场</div>'
          + '<p class="story-text">你在赌场做托。客人赢，你抽两成；客人输，账记在殡仪馆身上。</p>'
          + '<button class="btn primary" data-act="go-casino">去赌场</button></div>';
      }

      var a = f.active;
      if (!a) {
        h += '<div class="order-empty"><p>门口的车还没来。</p>'
          + '<button class="btn primary" data-act="funeral-start">接一单</button></div>';
      } else {
        var o = a.order;
        h += '<div class="order-card">'
          + '<div class="oc-head"><b>' + E(o.name) + '</b>'
          + '<span class="dim">' + o.age + ' 岁 · ' + E(o.cause) + '</span></div>'
          + '<div class="oc-line">家属：' + E(o.kin) + '</div>'
          + '<div class="oc-line">交代：' + E(o.demand) + '</div>'
          + '<div class="oc-line dim">预算 ' + o.purse + ' · 体面 ' + a.dig + '</div>'
          + '<div class="step-row">';
        DG.funeral.STEPS.forEach(function (st, i) {
          h += '<span class="step-chip' + (i < a.step ? ' done' : (i === a.step ? ' now' : '')) + '">'
            + E(st.name) + '</span>';
        });
        h += '</div>';

        var cur = DG.funeral.currentStep(f);
        if (cur) {
          h += '<div class="choice-list">';
          DG.funeral.choicesFor(s, cur.id).forEach(function (c) {
            h += '<button class="btn choice" data-act="funeral-choice" data-step="' + cur.id + '" data-id="' + c.id + '">'
              + E(c.text) + '</button>';
          });
          h += '</div>';
        } else {
          h += '<div class="choice-list"><button class="btn primary" data-act="funeral-settle">结这一单</button></div>';
        }

        if (a.log.length) {
          h += '<ul class="log">';
          a.log.forEach(function (l) { h += '<li>' + E(l.text) + '</li>'; });
          h += '</ul>';
        }
        h += '</div>';
      }

      if (f.log.length) {
        h += '<div class="panel-head"><h2>经手的单</h2></div><ul class="log">';
        f.log.forEach(function (r) {
          h += '<li><span class="t">[' + new Date(r.at).toTimeString().slice(0, 5) + ']</span>'
            + E(r.order.name) + ' · 体面 ' + r.dig + ' · 收 ' + r.pay + ' · 口碑 ' + (r.rep >= 0 ? '+' : '') + r.rep + '</li>';
        });
        h += '</ul>';
      }
      h += '</div>';
      this.$view.innerHTML = h;
    },

    pickFaction: function (id) {
      var r = DG.funeral.pickFaction(this.game, id);
      if (!r.ok) { this.notify(r.err); return; }
      this.log('开门：' + r.faction.shop + '（' + r.faction.name + '）。');
      this.renderAll();
    },

    funeralStart: function () {
      var r = DG.funeral.startOrder(this.game);
      if (!r.ok) { this.notify(r.err); return; }
      this.log('接单：' + r.order.name + '。');
      this.renderAll();
    },

    funeralChoice: function (stepId, choiceId) {
      var r = DG.funeral.choose(this.game, stepId, choiceId);
      if (!r.ok) { this.notify(r.err); return; }
      this.log(r.out);
      this.renderAll();
    },

    funeralSettle: function () {
      var r = DG.funeral.settle(this.game);
      if (!r.ok) { this.notify(r.err); return; }
      this.log('结单：' + r.rec.order.name + '，收 ' + r.rec.pay + '，口碑 ' + (r.rec.rep >= 0 ? '+' : '') + r.rec.rep + '。');
      this.notify('入账 ' + r.rec.pay);
      this.renderAll();
    },

    storyPlay: function (id) {
      var r = DG.funeral.playStory(this.game, id);
      if (!r.ok) { this.notify(r.err); return; }
      this.log('【' + r.story.title + '】');
      this.renderAll();
    },

    /* ---------- 技能树 ---------- */
    renderSkilltree: function () {
      var s = this.game, self = this;
      var h = '<div class="skill-layout"><div class="panel skill-tree"><div class="panel-head"><h2>技能树'
        + '<span class="dim">点技能即「备注」，消耗描述</span></h2></div><div class="branches">';
      ['A', 'B'].forEach(function (br) {
        h += '<div class="branch"><h3>' + E(DG.skills.BRANCHES[br].name) + '</h3>'
          + '<p class="b-desc">' + E(DG.skills.BRANCHES[br].desc) + '</p>';
        DG.skills.NODES.forEach(function (n) {
          if (n.branch !== br) return;
          var bought = !!s.skills[n.id];
          var cls, stateText;
          if (bought) { cls = 'bought'; stateText = '已录入'; }
          else if (n.requires && !s.skills[n.requires]) { cls = 'locked'; stateText = '需要前置：' + DG.skills.get(n.requires).name; }
          else if (s.desc < n.cost) { cls = 'locked'; stateText = '描述不足'; }
          else { cls = 'available'; stateText = '可录入'; }
          h += '<div class="skill-node ' + cls + '" data-act="skill-buy" data-id="' + n.id + '">'
            + '<div class="sn-name">' + E(n.name) + '</div>'
            + '<div class="sn-effect">' + E(n.effect) + '</div>'
            + '<div class="sn-cost">描述 ' + n.cost + '</div>'
            + '<div class="sn-state">' + E(stateText) + '</div></div>';
        });
        h += '</div>';
      });
      h += '</div></div>';

      var otak = DG.archive.byId(OTAC_ID);
      var quotes = (otak && otak.quotes && otak.quotes.length) ? otak.quotes : ['出现就是存在。'];
      h += '<aside class="panel otak-panel">'
        + '<img src="' + ART_OTAK + '" alt="Ótakmarkað 看板（占位图）">'
        + '<div class="otak-name">' + E(otak ? otak.name : 'Ótakmarkað（无限）') + '</div>'
        + '<div class="otak-arch">' + E(otak ? otak.archetype : 'guð / END-1') + ' · 技能树看板</div>'
        + '<div class="bubble" id="otak-bubble">' + E(quotes[(this.otakQuoteIdx + quotes.length) % quotes.length] || '……') + '</div>'
        + '</aside></div>';
      this.$view.innerHTML = h;
    },

    doBuySkill: function (id) {
      var n = DG.skills.get(id);
      var r = DG.skills.buy(this.game, id);
      if (!r.ok) { this.notify(r.err); return; }
      this.log('备注录入：' + n.name + ' —— ' + n.effect + '。');
      this.notify('已录入：' + n.name);
      this.otakQuote();
      this.renderAll();
    },

    /* ---------- 赌场 ---------- */
    renderCasino: function () {
      var s = this.game, self = this;
      var h = '<div class="casino-layout">';
      var eidos = DG.archive.byId(EIDOS_ID);
      h += '<aside class="panel eidos-panel">'
        + '<img src="' + ART_EIDOS + '" alt="Eidos 庄家（占位图）">'
        + '<div class="dealer-name">' + E(eidos ? eidos.name : '未型 / Eidos') + '</div>'
        + '<div class="dealer-arch">' + E(eidos ? eidos.archetype : '完人之门 · 邪神') + ' · 庄家</div>'
        + '<div class="dealer-line" id="eidos-line">「' + E(this.casino.dealerLine || '赔率永远公平。') + '」</div>'
        + '</aside>';

      h += '<div class="panel casino-main"><div class="panel-head"><h2>赌场'
        + '<span class="dim">万千世界交汇处 · 本店只认一种公平</span></h2></div>'
        + this.houseStripHtml();
      if (DG.house.isClosed(this.game)) {
        h += this.houseClosingHtml() + '</div></div>';
        this.$view.innerHTML = h;
        return;
      }
      h += '<div class="game-tabs">'
        + this.gameTabHtml('bj', '二十一点')
        + this.gameTabHtml('roulette', '轮盘')
        + this.gameTabHtml('slots', '老虎机')
        + this.gameTabHtml('sicbo', '骰宝')
        + this.gameTabHtml('baccarat', '百家乐')
        + '</div>'
        + '<div class="odds-note">' + E(GAME_RULES[this.casino.game]) + '</div>'
        + '<div class="tier-buttons">';
      DG.casino.TIERS.forEach(function (t) {
        var sel = self.casino.tier === t.id ? ' selected' : '';
        h += '<button class="tier-btn' + sel + '" data-act="tier-select" data-id="' + t.id + '">'
          + '<span class="t-name">' + E(t.label) + (t.demo ? ' <span class="t-demo">DEMO 展示</span>' : '') + '</span>'
          + '<span class="t-note">' + E(t.note) + '</span></button>';
      });
      h += '</div>';
      if (this.casino.game === 'roulette') h += this.renderRoulette();
      else if (this.casino.game === 'slots') h += this.renderSlots();
      else if (this.casino.game === 'sicbo') h += this.renderSicbo();
      else if (this.casino.game === 'baccarat') h += this.renderBaccarat();
      else h += this.renderBjTable();
      h += '<div class="panel-head" style="margin-top:14px"><h2>赌局记录</h2></div><ul class="log">';
      for (var i = 0; i < this.casinoLog.length; i++) {
        h += '<li class="' + (this.casinoLog[i].cruel ? 'cruel' : '') + '"><span class="t">[' + E(this.casinoLog[i].t) + ']</span>' + E(this.casinoLog[i].text) + '</li>';
      }
      h += '</ul></div></div>';
      this.$view.innerHTML = h;
    },

    gameTabHtml: function (id, label) {
      return '<span class="game-tab' + (this.casino.game === id ? ' active' : '') + '" data-act="game-tab" data-id="' + id + '">' + label + '</span>';
    },

    /* 二十一点牌桌：phase = idle | playing | done（状态存 this.casino.bj） */
    renderBjTable: function () {
      var bj = this.casino.bj;
      var h = '<div class="bj-table">';
      if (!bj) {
        h += '<div class="bj-idle">'
          + '<div class="bj-hint">选好赌注，开局。庄家是「完成」的维纳斯——她的赔率永远公平，公平才最值得害怕。</div>'
          + '<button class="btn primary" data-act="bj-deal"' + (this.casino.tier ? '' : ' disabled') + '>开局</button>'
          + '</div>';
        return h + '</div>';
      }
      var st = bj.state;
      var pv = DG.blackjack.handValue(st.player), dv = DG.blackjack.handValue(st.dealer);
      h += '<div class="bj-zone"><div class="bj-zone-label">庄家' + (st.holeHidden ? '' : ' · ' + dv.total + (dv.soft ? '（软）' : '')) + '</div>'
        + '<div class="bj-hand">' + this.bjHandHtml(st.dealer, st.holeHidden) + '</div></div>';
      h += '<div class="bj-zone"><div class="bj-zone-label">你 · ' + pv.total + (pv.soft ? '（软）' : '') + (st.fromSplit ? ' · 第 ' + (st.handNo || 1) + ' 手' : '') + (st.doubled ? ' · 已加倍' : '') + '</div>'
        + '<div class="bj-hand">' + this.bjHandHtml(st.player, false) + '</div></div>';
      h += '<div class="bj-area">';
      var rs = this.casino.res.bj;
      if (bj.phase === 'playing') {
        h += '<div id="casino-status">' + E(rs.status || '要牌，还是停牌。') + '</div>'
          + '<div class="bj-actions">'
          + '<button class="btn" data-act="bj-hit">要牌</button>'
          + '<button class="btn" data-act="bj-stand">停牌</button>'
          + '<button class="btn" data-act="bj-split"' + (DG.blackjack.canSplit(this.game, st) ? '' : ' disabled') + '>分牌</button>'
          + '<button class="btn" data-act="bj-double"' + (st.player.length === 2 && !st.demo ? '' : ' disabled') + '>加倍</button>'
          + '</div>';
      } else {
        h += '<div id="casino-status">' + E(rs.status || '') + '</div>'
          + '<div id="casino-result" class="' + (rs.resultCls || '') + '">' + E(rs.result || '') + '</div>'
          + '<button class="btn primary" data-act="bj-deal"' + (this.casino.tier ? '' : ' disabled') + '>再来一局</button>';
      }
      h += '</div></div>';
      return h;
    },

    /* 营业日条：第 N 日 / 营业 x/8 / 口碑 */
    houseStripHtml: function () {
      var h = DG.house.ensure(this.game);
      return '<div class="house-strip">'
        + '<span class="hs-item">第 ' + h.day + ' 日</span>'
        + '<span class="hs-sep">·</span>'
        + '<span class="hs-item">营业 ' + h.rounds + '/' + DG.house.DAY_ROUNDS + ' 局</span>'
        + '<span class="hs-sep">·</span>'
        + '<span class="hs-item">口碑 ' + h.reputation + '</span>'
        + '<span class="hs-note">这间厢子如今由你管着，牌桌是营业内容。</span>'
        + '</div>';
    },

    /* 打烊面板：当日账本 + 口碑变化 + 开门 */
    houseClosingHtml: function () {
      var h = DG.house.ensure(this.game);
      var last = h.ledger[h.ledger.length - 1];
      var body = '<div class="house-closing"><h3>打烊 · 第 ' + h.day + ' 日账本</h3>';
      if (!last) {
        body += '<div class="dim">今日无事。</div>';
      } else {
        body += '<table class="house-ledger"><tr><th>赌桌</th><th>局数</th><th>净额</th></tr>';
        for (var k in last.perTable) {
          if (!Object.prototype.hasOwnProperty.call(last.perTable, k)) continue;
          var row = last.perTable[k];
          body += '<tr><td>' + E(TABLE_LABEL[k] || k) + '</td><td>' + row.rounds + '</td><td>'
            + (row.net >= 0 ? '+' : '') + Math.round(row.net) + '</td></tr>';
        }
        body += '<tr><td>合计</td><td>' + last.rounds + '</td><td>'
          + (last.net >= 0 ? '+' : '') + Math.round(last.net) + '</td></tr></table>'
          + '<div class="house-rep">口碑 ' + last.repBefore + ' → ' + last.repAfter
          + '（' + (last.repDelta >= 0 ? '+' : '') + last.repDelta + '）</div>';
      }
      body += '<button class="btn primary" data-act="house-open">开门营业</button></div>';
      return body;
    },

    /* 每局结算后记进当日账本；满 DAY_ROUNDS 局自动打烊 */
    houseAfter: function (table, net) {
      var r = DG.house.recordRound(this.game, table, net || 0);
      if (r && r.closed && r.summary) {
        this.casinoLogAdd('打烊。第 ' + r.summary.day + ' 日：'
          + (r.summary.net >= 0 ? '+' : '') + Math.round(r.summary.net)
          + '，口碑 ' + r.summary.repAfter + '。');
      }
      return r;
    },

    houseOpen: function () {
      DG.house.nextDay(this.game);
      this.casinoLogAdd('开门。第 ' + DG.house.ensure(this.game).day + ' 日。');
      this.renderCasino();
    },

    bjHandHtml: function (cards, hideHole) {
      var h = '';
      for (var i = 0; i < cards.length; i++) {
        var hide = hideHole && i === 1;
        var red = cards[i].s === '♥' || cards[i].s === '♦';
        h += '<span class="bj-card' + (red ? ' red' : '') + (hide ? ' hole' : '') + '">'
          + (hide ? '?' : E(DG.blackjack.cardText(cards[i]))) + '</span>';
      }
      return h;
    },

    onTierSelect: function (id) {
      this.casino.tier = id;
      this.casino.res[this.casino.game].status = '已选赌注：' + DG.casino.get(id).label + ' ' + DG.casino.get(id).stake + '。';
      this.renderCasino();
    },

    /* 二十一点：开局（扣注+发牌；开局即 blackjack 直接结算） */
    bjDeal: function () {
      var self = this;
      if (!this.casino.tier) { this.notify('先选赌注'); return; }
      var r = DG.blackjack.newRound(this.game, this.casino.tier, Math.random, Date.now());
      if (!r.ok) { this.notify(r.err); return; }
      this.casino.bj = { phase: 'playing', state: r.state };
      this.casino.res.bj.status = '庄家洗牌中……';
      this.renderCasino();
      this.renderHud(); /* 下注即扣：HUD 立即反映，不等结算 */
      var st = r.state;
      if (st.openingBlackjack) {
        /* 开局二十一点：庄家亮牌判定后直接结算 */
        DG.blackjack.dealerPlay(st);
        DG.blackjack.settle(st);
        this.bjFinish(st);
      } else {
        this.eidosSay('要牌，还是停牌。');
      }
    },

    bjHit: function () {
      var bj = this.casino.bj;
      if (!bj || bj.phase !== 'playing') return;
      var r = DG.blackjack.hit(bj.state);
      if (!r.ok) { this.notify(r.err); return; }
      if (bj.state.done) { this.bjFinish(bj.state); return; }
      this.casino.res.bj.status = '你现在的点数：' + r.total + '。';
      this.renderCasino();
    },

    bjStand: function () {
      var bj = this.casino.bj;
      if (!bj || bj.phase !== 'playing') return;
      DG.blackjack.stand(bj.state);
      this.bjFinish(bj.state);
    },

    bjDouble: function () {
      var bj = this.casino.bj;
      if (!bj || bj.phase !== 'playing') return;
      var r = DG.blackjack.doubleDown(this.game, bj.state);
      if (!r.ok) { this.notify(r.err); return; }
      if (r.advanced) { this.casino.res.bj.status = '加倍。第 ' + (bj.state.handNo || 2) + ' 手。'; this.renderCasino(); this.renderHud(); return; }
      this.bjFinish(bj.state);
    },

    bjSplit: function () {
      var bj = this.casino.bj;
      if (!bj || bj.phase !== 'playing') return;
      var r = DG.blackjack.split(this.game, bj.state);
      if (!r.ok) { this.notify(r.err); return; }
      this.casino.res.bj.status = '分牌。这一手打完，再打下一手。';
      this.eidosSay('分牌。你把自己劈成了两个赌注——很像你会做的事。');
      this.renderCasino();
      this.renderHud();
    },

    /* 结算并入资源/统计/debuff，然后渲染结果态 */
    bjFinish: function (st) {
      var self = this;
      var r = DG.blackjack.applyToState(this.game, st, Date.now());
      this.houseAfter('bj', st.delta);
      this.casino.bj.phase = 'done';
      var rs = this.casino.res.bj;
      var resName = st.tier.res === 'desc' ? '描述' : '情绪';
      rs.status = st.outcome === 'blackjack' ? '二十一点。极点。'
        : st.outcome === 'push' ? '和局。'
        : st.outcome === 'win' ? '你赢了。' : '你输了。';
      rs.resultCls = st.outcome === 'lose' ? 'lose' : (st.outcome === 'push' ? '' : 'win');
      rs.result = st.payoutDesc + (st.demo ? '（存在档 demo：不结算资源）' : '');
      if (st.eidosLine) this.eidosSay(st.eidosLine);
      else this.eidosSay(st.outcome === 'lose' ? '你输了。也完美地。' : '你赢了。完美地。');
      this.casinoLogAdd('押 ' + st.bet + ' ' + E(st.tier.label) + '（' + resName + '）→ '
        + st.outcome + '，' + (st.delta >= 0 ? '+' : '') + st.delta);
      if (r.completed) {
        this.eidosSay('连败至此。你已被「完成」——完美，且不再说话。');
        this.casinoLogAdd(r.completionText, true);
      }
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
    },

    eidosSay: function (line) {
      this.casino.dealerLine = line; /* 存入 state：renderCasino 重建 DOM 后台词不丢 */
      var el = document.getElementById('eidos-line');
      if (el) el.textContent = '「' + line + '」';
    },

    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    /* ---------- 事件系统（赌局结算后由 afterRound 钩子触发） ---------- */
    /* 每局结算后调用：掷事件触发判定，弹出则开事件弹窗 */
    afterRound: function () {
      var ev = DG.events.maybeTrigger(this.game, {});
      if (ev) this.modalEvent(ev);
    },

    modalEvent: function (ev) {
      var self = this;
      this.casino.event = ev;
      var h = '<h2>' + E(ev.title) + '</h2>'
        + '<div class="m-sub">' + (ev.npc ? E(ev.npc) : '氛围事件') + ' · ' + (ev.type === 'companion' ? '陪玩' : '赌场事件') + '</div>'
        + '<div class="archive-lines">' + E(ev.text) + '</div>'
        + '<div class="modal-actions">';
      ev.choices.forEach(function (c, i) {
        h += '<button class="btn' + (i === 0 ? ' primary' : '') + '" data-act="event-choice" data-idx="' + i + '">' + E(c.text) + '</button>';
      });
      h += '</div>';
      this.openModal(h);
    },

    onEventChoice: function (idx) {
      var ev = this.casino.event;
      if (!ev) return;
      var txt = DG.events.applyChoice(this.game, ev, Number(idx), Date.now());
      this.casino.event = null;
      this.closeModal();
      this.casinoLogAdd('事件「' + ev.title + '」：' + ev.choices[Number(idx)].text + '。' + (txt || ''), false);
      this.eidosSay(ev.type === 'companion' ? '她记下了这一次。' : '赌场照常营业。');
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
    },

    /* ---------- 游戏页签 / 筹码 ---------- */
    onGameTab: function (id) {
      if (this.casino.game === id) return;
      this.casino.game = id;
      this.renderCasino();
    },
    onChipSelect: function (v) {
      this.casino.chip = v;
      this.renderCasino();
    },

    /* ---------- 骰宝 ---------- */
    sbBetsArray: function () {
      var out = [];
      for (var id in this.casino.sb.bets) out.push({ id: id, stake: this.casino.sb.bets[id] });
      return out;
    },
    sbStaked: function () {
      var sum = 0;
      for (var id in this.casino.sb.bets) sum += this.casino.sb.bets[id];
      return sum;
    },
    sbBet: function (id) {
      if (!DG.sicbo.areaOf(id)) return;
      var t = DG.casino.get(this.casino.tier);
      if (!t) { this.notify('先选赌注等级'); return; }
      if (!t.demo && this.game[t.res] < this.sbStaked() + this.casino.chip) {
        this.casino.res.sicbo.status = (t.res === 'desc' ? '描述' : '情绪') + '不足：已押 ' + this.sbStaked() + '，持有 ' + this.game[t.res];
        this.renderCasino(); return;
      }
      this.casino.sb.bets[id] = (this.casino.sb.bets[id] || 0) + this.casino.chip;
      this.casino.res.sicbo.status = '';
      this.renderCasino();
    },
    sbClear: function () {
      this.casino.sb.bets = {};
      this.casino.res.sicbo.status = '';
      this.renderCasino();
    },
    sbRoll: function () {
      var t = DG.casino.get(this.casino.tier);
      var bets = this.sbBetsArray(), staked = this.sbStaked();
      if (!t) { this.notify('先选赌注等级'); return; }
      if (!bets.length) { this.casino.res.sicbo.status = '先下注。'; this.renderCasino(); return; }
      if (!t.demo && this.game[t.res] < staked) {
        this.casino.res.sicbo.status = (t.res === 'desc' ? '描述' : '情绪') + '不足：已押 ' + staked + '，持有 ' + this.game[t.res];
        this.renderCasino(); return;
      }
      var now = Date.now();
      if (!t.demo) this.game[t.res] -= staked;
      this.game.stats.rounds++;
      var roll = DG.sicbo.rollDice();
      var r = DG.sicbo.settle(bets, roll);
      var net = t.demo ? 0 : r.net;
      var ap = { completed: false };
      if (!t.demo) ap = DG.casino.applyOutcome(this.game, t, net, now);
      this.houseAfter('sicbo', t.demo ? 0 : net);
      if (ap.completed) this.casinoLogAdd(ap.completionText, true);
      this.casino.sb.roll = roll;
      this.casino.sb.bets = {};
      this.casino.sb.history.unshift({ d: roll.d.slice(), total: roll.total, net: net });
      if (this.casino.sb.history.length > 12) this.casino.sb.history.pop();
      var hits = r.details.filter(function (x) { return x.hit; });
      var resName = t.res === 'desc' ? '描述' : '情绪';
      this.casino.res.sicbo.result = '落袋 ' + roll.d.join(' ') + '（' + roll.total + ' 点）。'
        + (t.demo ? '存在档 demo：不结算资源。'
          : (hits.length
            ? '中 ' + hits.length + ' 注：' + hits.map(function (x) { return DG.sicbo.areaOf(x.id).label + ' ×' + x.mult; }).join('、') + '。净 ' + (net >= 0 ? '+' : '') + net + ' ' + resName + '。'
            : '全灭。付掉 ' + staked + ' ' + resName + '。'));
      this.casino.res.sicbo.resultCls = net > 0 ? 'win' : 'lose';
      this.casino.res.sicbo.status = '';
      this.casinoLogAdd('骰宝 ' + roll.d.join('') + '：' + (net >= 0 ? '+' : '') + net + ' ' + resName + '。', ap.completed);
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
      this.afterRound();
    },
    renderSicbo: function () {
      var self = this, sb = this.casino.sb, rs = this.casino.res.sicbo;
      var t = DG.casino.get(this.casino.tier);
      var staked = this.sbStaked();
      var canRoll = !!t && staked > 0 && (t.demo || this.game[t.res] >= staked);
      var h = '<div class="sb-wrap">';
      /* 落袋结果 + 历史 */
      h += '<div class="rl-result">'
        + '<div class="sb-dice">'
        + (sb.roll ? sb.roll.d.map(function (d) { return '<span class="sb-die">' + d + '</span>'; }).join('') : '<span class="sb-die none">?</span><span class="sb-die none">?</span><span class="sb-die none">?</span>')
        + '</div>'
        + '<div class="rl-side">'
        + '<div id="casino-status">' + E(rs.status || (sb.roll ? '落袋 ' + sb.roll.total + ' 点。' : '下注，然后投掷。')) + '</div>'
        + '<div id="casino-result" class="' + E(rs.resultCls) + '">' + E(rs.result || '') + '</div>'
        + '<div class="rl-history">';
      sb.history.forEach(function (x) {
        h += '<span class="rl-hp">' + x.d.join('') + '·' + x.total + '</span>';
      });
      h += '</div></div></div>';
      /* 大小 */
      h += '<div class="sb-row">';
      DG.sicbo.AREAS.filter(function (a) { return a.id === 'big' || a.id === 'small'; }).forEach(function (a) {
        h += '<button class="sb-area wide' + (a.id === 'big' ? ' big' : ' small') + '" data-act="sb-bet" data-id="' + a.id + '">'
          + '<span>' + E(a.label) + '</span><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div>';
      /* 点数 4-17 */
      h += '<div class="sb-grid">';
      DG.sicbo.AREAS.filter(function (a) { return a.id.indexOf('total:') === 0; }).forEach(function (a) {
        h += '<button class="sb-area num" data-act="sb-bet" data-id="' + a.id + '">'
          + '<b>' + E(a.label) + '</b><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div>';
      /* 单骰 / 对子 / 围骰 / 组合 */
      h += '<div class="sb-row">';
      DG.sicbo.AREAS.filter(function (a) { return a.id.indexOf('single:') === 0; }).forEach(function (a) {
        h += '<button class="sb-area sm" data-act="sb-bet" data-id="' + a.id + '">'
          + '<b>' + E(a.label) + '</b><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div><div class="sb-row">';
      DG.sicbo.AREAS.filter(function (a) { return a.id.indexOf('pair:') === 0; }).forEach(function (a) {
        h += '<button class="sb-area sm" data-act="sb-bet" data-id="' + a.id + '">'
          + '<b>' + E(a.label) + '</b><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div><div class="sb-row">';
      DG.sicbo.AREAS.filter(function (a) { return a.id.indexOf('triple:') === 0; }).forEach(function (a) {
        h += '<button class="sb-area sm triple" data-act="sb-bet" data-id="' + a.id + '">'
          + '<b>' + E(a.label) + '</b><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div><div class="sb-row">';
      DG.sicbo.AREAS.filter(function (a) { return a.id.indexOf('combo:') === 0; }).forEach(function (a) {
        h += '<button class="sb-area sm combo" data-act="sb-bet" data-id="' + a.id + '">'
          + '<b>' + E(a.label) + '</b><i>' + E(a.note) + '</i>' + self.sbChipHtml(a.id) + '</button>';
      });
      h += '</div>';
      /* 筹码 + 操作 */
      h += '<div class="rl-controls">'
        + '<div class="chip-row">';
      [10, 50, 100].forEach(function (v) {
        h += '<button class="chip-btn' + (self.casino.chip === v ? ' selected' : '') + '" data-act="chip-select" data-id="' + v + '">' + v + '</button>';
      });
      h += '</div><div class="rl-ops">'
        + '<span class="rl-staked">已押 ' + staked + '</span>'
        + '<button class="btn" data-act="sb-clear">清空</button>'
        + '<button class="btn primary" data-act="sb-roll"' + (canRoll ? '' : ' disabled') + '>投掷</button>'
        + '</div></div></div>';
      return h;
    },
    sbChipHtml: function (id) {
      var v = this.casino.sb.bets[id];
      return v ? '<span class="chip-badge">' + v + '</span>' : '';
    },

    /* ---------- 百家乐 ---------- */
    bcBetsArray: function () {
      var out = [];
      for (var id in this.casino.bc.bets) out.push({ bet: id, stake: this.casino.bc.bets[id] });
      return out;
    },
    bcStaked: function () {
      var sum = 0;
      for (var id in this.casino.bc.bets) sum += this.casino.bc.bets[id];
      return sum;
    },
    bcBet: function (bet) {
      var t = DG.casino.get(this.casino.tier);
      if (!t) { this.notify('先选赌注等级'); return; }
      if (!t.demo && this.game[t.res] < this.bcStaked() + this.casino.chip) {
        this.casino.res.baccarat.status = (t.res === 'desc' ? '描述' : '情绪') + '不足：已押 ' + this.bcStaked() + '，持有 ' + this.game[t.res];
        this.renderCasino(); return;
      }
      this.casino.bc.bets[bet] = (this.casino.bc.bets[bet] || 0) + this.casino.chip;
      this.casino.res.baccarat.status = '';
      this.renderCasino();
    },
    bcClear: function () {
      this.casino.bc.bets = {};
      this.casino.res.baccarat.status = '';
      this.renderCasino();
    },
    bcDeal: function () {
      var t = DG.casino.get(this.casino.tier);
      var bets = this.bcBetsArray(), staked = this.bcStaked();
      if (!t) { this.notify('先选赌注等级'); return; }
      if (!bets.length) { this.casino.res.baccarat.status = '先下注（闲 / 庄 / 和）。'; this.renderCasino(); return; }
      if (!t.demo && this.game[t.res] < staked) {
        this.casino.res.baccarat.status = (t.res === 'desc' ? '描述' : '情绪') + '不足：已押 ' + staked + '，持有 ' + this.game[t.res];
        this.renderCasino(); return;
      }
      var now = Date.now();
      if (!t.demo) this.game[t.res] -= staked;
      this.game.stats.rounds++;
      if (!this.casino.bc.shoe) this.casino.bc.shoe = DG.baccarat.newShoe();
      var r = DG.baccarat.dealRound(this.casino.bc.shoe);
      var r2 = DG.baccarat.settleBets(bets, r.outcome);
      var net = t.demo ? 0 : r2.net;
      if (!t.demo) {
        var ap = DG.casino.applyOutcome(this.game, t, net, now);
        if (ap.completed) this.casinoLogAdd(ap.completionText, true);
        this.houseAfter('baccarat', net);
      }
      this.casino.bc.round = r;
      this.casino.bc.bets = {};
      this.casino.bc.history.unshift({ outcome: r.outcome, p: r.pTotal, b: r.bTotal, net: net });
      if (this.casino.bc.history.length > 12) this.casino.bc.history.pop();
      var resName = t.res === 'desc' ? '描述' : '情绪';
      var outcomeName = r.outcome === 'player' ? '闲' : (r.outcome === 'banker' ? '庄' : '和');
      this.casino.res.baccarat.result = '闲 ' + r.pTotal + ' : ' + r.bTotal + ' 庄 → ' + outcomeName + '。'
        + (t.demo ? '存在档 demo：不结算资源。'
          : (net === 0 ? '和局退注。'
            : '净 ' + (net >= 0 ? '+' : '') + net.toFixed(2).replace(/\.00$/, '') + ' ' + resName + '。'));
      this.casino.res.baccarat.resultCls = net > 0 ? 'win' : (net < 0 ? 'lose' : '');
      this.casino.res.baccarat.status = '';
      this.casinoLogAdd('百家乐 闲' + r.pTotal + ':庄' + r.bTotal + ' ' + outcomeName + '：' + (net >= 0 ? '+' : '') + net.toFixed(2).replace(/\.00$/, '') + ' ' + resName + '。');
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
      this.afterRound();
    },
    bcCardHtml: function (c) {
      var red = c.suit === '♥' || c.suit === '♦';
      return '<span class="bj-card' + (red ? ' red' : '') + '">' + E(c.rank) + E(c.suit) + '</span>';
    },
    renderBaccarat: function () {
      var self = this, bc = this.casino.bc, rs = this.casino.res.baccarat;
      var t = DG.casino.get(this.casino.tier);
      var staked = this.bcStaked();
      var canDeal = !!t && staked > 0 && (t.demo || this.game[t.res] >= staked);
      var h = '<div class="bc-wrap">';
      /* 开牌结果区 */
      h += '<div class="bc-board">';
      if (bc.round) {
        var r = bc.round;
        h += '<div class="bc-hand"><div class="bc-hand-label">闲 ' + r.pTotal + (r.natural ? ' · 例牌' : '') + '</div><div class="bj-hand">'
          + r.player.map(function (c) { return self.bcCardHtml(c); }).join('') + '</div></div>'
          + '<div class="bc-vs">VS</div>'
          + '<div class="bc-hand"><div class="bc-hand-label">庄 ' + r.bTotal + (r.natural ? ' · 例牌' : '') + '</div><div class="bj-hand">'
          + r.banker.map(function (c) { return self.bcCardHtml(c); }).join('') + '</div></div>';
      } else {
        h += '<div class="bc-hand"><div class="bc-hand-label">闲 —</div><div class="bj-hand"><span class="bj-card hole"></span><span class="bj-card hole"></span></div></div>'
          + '<div class="bc-vs">VS</div>'
          + '<div class="bc-hand"><div class="bc-hand-label">庄 —</div><div class="bj-hand"><span class="bj-card hole"></span><span class="bj-card hole"></span></div></div>';
      }
      h += '</div>';
      h += '<div id="casino-status">' + E(rs.status || '押闲、押庄或押和，然后开牌。') + '</div>'
        + '<div id="casino-result" class="' + E(rs.resultCls) + '">' + E(rs.result || '') + '</div>';
      /* 路单 */
      h += '<div class="bc-road">';
      bc.history.forEach(function (x) {
        var cls = x.outcome === 'player' ? 'p' : (x.outcome === 'banker' ? 'b' : 't');
        h += '<span class="bc-bead ' + cls + '" title="' + x.p + ':' + x.b + '">' + (x.outcome === 'player' ? '闲' : (x.outcome === 'banker' ? '庄' : '和')) + '</span>';
      });
      h += '</div>';
      /* 下注区 */
      h += '<div class="bc-bets">';
      DG.baccarat.BETS.forEach(function (b) {
        var v = bc.bets[b.id] || 0;
        h += '<button class="bc-bet ' + b.id + '" data-act="bc-bet" data-id="' + b.id + '">'
          + '<b>' + E(b.label) + '</b><i>' + E(b.note) + '</i>'
          + (v ? '<span class="chip-badge">' + v + '</span>' : '') + '</button>';
      });
      h += '</div>';
      /* 筹码 + 操作 */
      h += '<div class="rl-controls">'
        + '<div class="chip-row">';
      [10, 50, 100].forEach(function (v) {
        h += '<button class="chip-btn' + (self.casino.chip === v ? ' selected' : '') + '" data-act="chip-select" data-id="' + v + '">' + v + '</button>';
      });
      h += '</div><div class="rl-ops">'
        + '<span class="rl-staked">已押 ' + staked + '</span>'
        + '<button class="btn" data-act="bc-clear">清空</button>'
        + '<button class="btn primary" data-act="bc-deal"' + (canDeal ? '' : ' disabled') + '>开牌</button>'
        + '</div></div></div>';
      return h;
    },

    /* ---------- 游戏页签 / 筹码 ---------- */
    onGameTab: function (id) {
      if (this.casino.game === id) return;
      this.casino.game = id;
      this.renderCasino();
    },
    onChipSelect: function (v) {
      this.casino.chip = v;
      this.renderCasino();
    },

    /* ---------- 轮盘 ---------- */
    rlBetsArray: function () {
      var out = [];
      for (var id in this.casino.rl.bets) out.push({ id: id, stake: this.casino.rl.bets[id] });
      return out;
    },
    rlStaked: function () {
      var sum = 0;
      for (var id in this.casino.rl.bets) sum += this.casino.rl.bets[id];
      return sum;
    },
    rlChipHtml: function (id) {
      var v = this.casino.rl.bets[id];
      return v ? '<span class="chip-badge">' + v + '</span>' : '';
    },
    renderRoulette: function () {
      var self = this, rl = this.casino.rl, rs = this.casino.res.roulette;
      var t = DG.casino.get(this.casino.tier);
      var staked = this.rlStaked();
      var canSpin = !!t && staked > 0 && (t.demo || this.game[t.res] >= staked);
      /* 资金不足时在状态行说明原因（按钮禁用不解释 = 差的赌场 UX） */
      var statusTxt = rs.status || '下注，然后旋转。';
      if (t && !t.demo && staked > 0 && this.game[t.res] < staked) {
        statusTxt = (t.res === 'desc' ? '描述' : '情绪') + '不足：已押 ' + staked + '，持有 ' + Math.floor(this.game[t.res]) + '。';
      }
      var h = '<div class="rl-wrap">';
      /* 落袋结果 + 历史 */
      h += '<div class="rl-result">'
        + '<div class="rl-pocket ' + (rl.pocket === null ? 'none' : DG.roulette.pocketColor(rl.pocket)) + '">'
        + (rl.pocket === null ? '—' : rl.pocket) + '</div>'
        + '<div class="rl-side">'
        + '<div id="casino-status">' + E(statusTxt) + '</div>'
        + '<div id="casino-result" class="' + (rs.resultCls || '') + '">' + E(rs.result || '') + '</div>'
        + '<div class="rl-history">';
      for (var i = 0; i < rl.history.length; i++) {
        h += '<span class="rl-hp ' + DG.roulette.pocketColor(rl.history[i]) + '">' + rl.history[i] + '</span>';
      }
      h += '</div></div></div>';
      /* 投注桌：0 + 1-36（3×12） */
      h += '<div class="rl-grid">';
      h += '<button class="rl-cell green" data-act="rl-bet" data-id="straight:0"><span class="rl-num">0</span>' + this.rlChipHtml('straight:0') + '</button>';
      for (var n = 1; n <= 36; n++) {
        h += '<button class="rl-cell ' + DG.roulette.pocketColor(n) + '" data-act="rl-bet" data-id="straight:' + n + '"><span class="rl-num">' + n + '</span>' + this.rlChipHtml('straight:' + n) + '</button>';
      }
      /* 打数 ×3 + 列 ×3 */
      [1, 2, 3].forEach(function (d) {
        var id = 'dozen:' + d;
        h += '<button class="rl-out wide" data-act="rl-bet" data-id="' + id + '">' + DG.roulette.betLabel({ id: id }) + self.rlChipHtml(id) + '</button>';
      });
      [1, 2, 3].forEach(function (c) {
        var id = 'col:' + c;
        h += '<button class="rl-out wide" data-act="rl-bet" data-id="' + id + '">' + DG.roulette.betLabel({ id: id }) + self.rlChipHtml(id) + '</button>';
      });
      /* 外围 ×6 */
      ['red', 'black', 'odd', 'even', 'low', 'high'].forEach(function (oid) {
        h += '<button class="rl-out' + (oid === 'red' ? ' red' : (oid === 'black' ? ' black' : '')) + '" data-act="rl-bet" data-id="' + oid + '">'
          + DG.roulette.betLabel({ id: oid }) + self.rlChipHtml(oid) + '</button>';
      });
      h += '</div>';
      /* 筹码与操作 */
      h += '<div class="rl-controls"><div class="chip-row">';
      [10, 50, 100].forEach(function (cv) {
        h += '<button class="chip-btn' + (self.casino.chip === cv ? ' selected' : '') + '" data-act="chip-select" data-id="' + cv + '">' + cv + '</button>';
      });
      h += '</div><div class="rl-ops">'
        + '<span class="rl-staked">已押 ' + staked + '</span>'
        + '<button class="btn" data-act="rl-clear"' + (staked ? '' : ' disabled') + '>清空</button>'
        + '<button class="btn primary" data-act="rl-spin"' + (canSpin ? '' : ' disabled') + '>旋转</button>'
        + '</div></div>';
      return h + '</div>';
    },
    rlBet: function (id) {
      if (!this.casino.tier) { this.notify('先选赌注'); return; }
      this.casino.rl.bets[id] = (this.casino.rl.bets[id] || 0) + this.casino.chip;
      this.casino.res.roulette.status = '已押 ' + DG.roulette.betLabel({ id: id }) + ' ' + this.casino.chip + '（合计 ' + this.rlStaked() + '）。';
      this.renderCasino();
    },
    rlClear: function () {
      this.casino.rl.bets = {};
      this.casino.res.roulette.status = '注已清空。';
      this.renderCasino();
    },
    rlSpin: function () {
      var t = DG.casino.get(this.casino.tier);
      if (!t) { this.notify('先选赌注'); return; }
      var bets = this.rlBetsArray();
      if (!bets.length) { this.notify('先下注'); return; }
      var staked = this.rlStaked();
      if (!t.demo && this.game[t.res] < staked) {
        this.notify((t.res === 'desc' ? '描述' : '情绪') + '不足（需要 ' + staked + '）');
        return;
      }
      if (!t.demo) this.game[t.res] -= staked;
      this.game.stats.rounds++;
      var n = DG.roulette.spin(Math.random);
      var r = DG.roulette.settleBets(bets, n);
      var out = DG.casino.applyOutcome(this.game, t, t.demo ? 0 : r.net, Date.now());
      this.houseAfter('roulette', t.demo ? 0 : r.net);
      this.casino.rl.pocket = n;
      this.casino.rl.history.unshift(n);
      if (this.casino.rl.history.length > 12) this.casino.rl.history.pop();
      var rs = this.casino.res.roulette;
      if (r.net > 0) {
        var wins = r.items.filter(function (i) { return i.win; }).map(function (i) { return i.label; }).join('、');
        rs.resultCls = 'win';
        rs.result = '落袋 ' + n + '（' + r.colorName + '）：' + wins + ' 中。收回 ' + r.returned + '，净 +' + r.net
          + (t.demo ? '（存在档 demo：不结算资源）' : '');
      } else {
        rs.resultCls = 'lose';
        rs.result = '落袋 ' + n + '（' + r.colorName + '）：全灭。付掉 ' + staked
          + (t.demo ? '（存在档 demo：不结算资源）' : '');
      }
      if (n === 0) this.eidosSay('0。万物归一者落了座。外围注全灭——只有直号配活下来。');
      else if (r.net > 0) this.eidosSay(this.pick(['赢了。概率暂时站在你这边——它很少这样。', '收筹码。别感恩，概率会要回去。', '这一把，连我都稍微意外了一下。']));
      else this.eidosSay(this.pick(['输了。正常。', '筹码归庄家。完美地。', '下注的时候，你就已经输了——只是现在才知道。']));
      this.casinoLogAdd('轮盘 ' + n + '（' + r.colorName + '）押 ' + staked + ' ' + E(t.label) + ' → ' + (r.net >= 0 ? '+' : '') + r.net);
      if (out.completed) {
        this.eidosSay('连败至此。你已被「完成」——完美，且不再说话。');
        this.casinoLogAdd(out.completionText, true);
      }
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
    },

    /* ---------- 老虎机 ---------- */
    renderSlots: function () {
      var self = this, sl = this.casino.sl, rs = this.casino.res.slots;
      var t = DG.casino.get(this.casino.tier);
      var canSpin = !!t && (t.demo || this.game[t.res] >= this.casino.chip);
      var h = '<div class="sl-wrap"><div class="sl-machine"><div class="sl-reels' + (rs.resultCls === 'win' ? ' win' : '') + '">';
      for (var i = 0; i < 3; i++) {
        var sym = sl.reels ? sl.reels[i] : null;
        h += '<div class="sl-reel' + (sym ? ' ' + sym.id : '') + '">' + (sym ? E(sym.icon) : '?') + '</div>';
      }
      h += '</div><div class="sl-line"></div></div>'
        + '<div id="casino-status">' + E(rs.status || '拉杆，或者别拉。概率都在我手里。') + '</div>'
        + '<div id="casino-result" class="' + (rs.resultCls || '') + '">' + E(rs.result || '') + '</div>'
        + '<div class="sl-history">';
      for (var j = 0; j < sl.history.length; j++) {
        var hr = sl.history[j];
        h += '<span class="sl-hitem">' + hr.reels.map(function (x) { return E(x.icon); }).join('')
          + (hr.mult > 0 ? '<i>×' + hr.mult + '</i>' : '') + '</span>';
      }
      h += '</div><div class="sl-paytable"><div class="sl-pt-title">赔付表（×赌注）</div><table class="sl-pt">';
      DG.slots.SYMBOLS.slice().reverse().forEach(function (s) {
        h += '<tr><td class="sl-pt-icon">' + E(s.icon) + ' ' + E(s.name) + '</td>'
          + '<td>三连 ×' + s.pay3 + '</td>'
          + '<td>' + (s.pay2 > 0 ? '成双 ×' + s.pay2 : '—') + '</td></tr>';
      });
      h += '</table></div>'
        + '<div class="sl-controls"><div class="chip-row">';
      [10, 50, 100].forEach(function (cv) {
        h += '<button class="chip-btn' + (self.casino.chip === cv ? ' selected' : '') + '" data-act="chip-select" data-id="' + cv + '">' + cv + '</button>';
      });
      h += '</div><button class="btn primary sl-spin" data-act="sl-spin"' + (canSpin ? '' : ' disabled') + '>拉杆（'
        + this.casino.chip + ' ' + E(t ? t.label : '') + '）</button></div></div>';
      return h;
    },
    slSpin: function () {
      var t = DG.casino.get(this.casino.tier);
      if (!t) { this.notify('先选赌注'); return; }
      var bet = this.casino.chip;
      if (!t.demo && this.game[t.res] < bet) {
        this.notify((t.res === 'desc' ? '描述' : '情绪') + '不足（需要 ' + bet + '）');
        return;
      }
      if (!t.demo) this.game[t.res] -= bet;
      this.game.stats.rounds++;
      var r = DG.slots.spin(Math.random);
      var delta = t.demo ? 0 : (r.mult > 0 ? bet * r.mult : -bet);
      var out = DG.casino.applyOutcome(this.game, t, delta, Date.now());
      this.houseAfter('slots', delta);
      this.casino.sl.reels = r.reels;
      this.casino.sl.history.unshift({ reels: r.reels, mult: r.mult });
      if (this.casino.sl.history.length > 8) this.casino.sl.history.pop();
      var icons = r.reels.map(function (x) { return x.icon; }).join(' ');
      var rs = this.casino.res.slots;
      if (r.kind === 'three') {
        rs.resultCls = 'win';
        rs.result = icons + ' 三连 ' + r.symbol.name + '！赔 ' + r.mult + ' 倍，净 +' + delta
          + (t.demo ? '（存在档 demo：不结算资源）' : '');
        this.eidosSay(r.symbol.id === 'seven' ? '三连七。极点。概率终于公平了一回——仅此一回。' : '三连 ' + r.symbol.name + '。收好，这是你应得的。');
      } else if (r.kind === 'pair') {
        rs.resultCls = 'win';
        rs.result = icons + ' ' + r.symbol.name + ' 成双（' + r.mult + ' 倍），净 +' + delta
          + (t.demo ? '（存在档 demo：不结算资源）' : '');
        this.eidosSay('成双。散在台上的两个，也配拿走一点。');
      } else {
        rs.resultCls = 'lose';
        rs.result = icons + ' 未中奖。付掉 ' + bet + (t.demo ? '（存在档 demo：不结算资源）' : '');
        this.eidosSay(this.pick(['未中奖。常规。', '差一点。概率没有「差一点」。', '再拉一次？它随时会吃。']));
      }
      this.casinoLogAdd('老虎机 ' + icons + ' → ' + (r.kind === 'none' ? '未中奖' : r.symbol.name + ' ×' + r.mult) + '，' + (delta >= 0 ? '+' : '') + delta);
      if (out.completed) {
        this.eidosSay('连败至此。你已被「完成」——完美，且不再说话。');
        this.casinoLogAdd(out.completionText, true);
      }
      this.renderHud();
      if (this.view === 'casino') this.renderCasino();
    },

    /* ---------- 弹窗 ---------- */
    openModal: function (html) {
      document.getElementById('modal-root').innerHTML =
        '<div class="modal-mask" data-act="modal-mask"><div class="modal-box">' + html + '</div></div>';
    },
    closeModal: function () { document.getElementById('modal-root').innerHTML = ''; },

    modalRoster: function () {
      var self = this;
      var worlds = DG.archive.worlds();
      var h = '<h2>OC 名录 · 收容</h2><div class="m-sub">共 ' + DG.archive.all().length + ' 条档案 · 点「收容」将该单位置入空格</div>'
        + '<div class="roster-filters">'
        + '<select data-act="roster-world"><option>全部世界</option>';
      worlds.forEach(function (w) {
        h += '<option' + (self.rosterFilter.world === w.name ? ' selected' : '') + '>' + E(w.name) + '</option>';
      });
      h += '</select><select data-act="roster-rarity"><option>全部稀有度</option>';
      ['SSR', 'SR', 'DISASTER', 'R'].forEach(function (r) {
        h += '<option' + (self.rosterFilter.rarity === r ? ' selected' : '') + '>' + r + '</option>';
      });
      h += '</select></div><div class="roster-list">';
      var list = DG.archive.filter(this.game, this.rosterFilter);
      if (!list.length) h += '<p style="color:var(--dim)">没有符合条件的档案。</p>';
      list.forEach(function (row) {
        var u = row.unit;
        h += '<div class="roster-row' + (row.contained ? ' contained' : '') + '" style="--uc:' + E(u.color) + '">'
          + '<span class="r-rarity rarity ' + E(u.rarity) + '">' + E(u.rarity) + '</span>'
          + '<span><span class="r-name">' + E(u.name) + '</span><br>'
          + '<span class="r-meta">' + E(u.world) + ' · ' + E(u.archetype) + ' · 产出 ' + E(DG.archive.yieldLabel(u)) + ' +' + u.yieldRate + '/s · 污染 ' + u.pollution + '</span></span>'
          + (row.contained
            ? '<span class="r-act" style="color:var(--dim)">在驻</span>'
            : '<button class="btn small" data-act="roster-contain" data-id="' + E(u.id) + '">收容</button>')
          + '</div>';
      });
      h += '</div><div class="modal-actions"><button class="btn" data-act="modal-close">关闭</button></div>';
      this.openModal(h);
    },

    modalFailure: function (ev) {
      var h = '<h2 style="color:var(--danger)">收容失效记录</h2>'
        + '<div class="m-sub">' + E(ev.serial) + ' · ' + E(ev.name) + '（' + E(ev.archetype) + '）</div>'
        + '<div class="archive-lines">';
      ev.lines.forEach(function (l, i) {
        var cruel = (ev.outcome === 'escape' && i === 1);
        h += '<div class="' + (cruel ? 'cruel' : '') + '">' + E(l) + '</div>';
      });
      h += '</div><div class="modal-actions"><button class="btn primary" data-act="modal-close">已知晓</button></div>';
      this.openModal(h);
      this.log('收容失效：' + ev.name + ' 发生扩散（' + ev.outcome + '）。', ev.outcome === 'escape');
      ev.lines.forEach(function (l) { /* 已合并写入日志 */ });
    },

    modalOffline: function (sum) {
      var min = Math.floor(sum.seconds / 60), sec = sum.seconds % 60;
      var h = '<h2>离线补算</h2><div class="m-sub">离线期间不计时，按 50% 效率补算，封顶 2 小时</div>'
        + '<div class="archive-lines">'
        + '<div>离线时长：' + min + ' 分 ' + sec + ' 秒（补算 ' + sum.seconds + ' 秒' + (sum.capped ? '，超出封顶的 ' + sum.skipped + ' 秒已忽略' : '') + '）。</div>'
        + '<div>描述 +' + Math.floor(sum.desc) + '，情绪 +' + Math.floor(sum.mood) + '。</div>'
        + (sum.failure ? '<div class="cruel">补算期间发生一次收容失效：' + E(sum.failure.name) + '（' + E(sum.failure.outcome) + '）。</div>' : '')
        + '</div><div class="modal-actions"><button class="btn primary" data-act="modal-close">已知晓</button></div>';
      this.openModal(h);
      this.log('离线补算 ' + min + ' 分 ' + sec + ' 秒（50% 效率）：描述 +' + Math.floor(sum.desc) + '，情绪 +' + Math.floor(sum.mood) + '。');
      if (sum.failure) this.log('补算期间收容失效：' + sum.failure.name + '。', true);
    },

    modalConfirm: function (text, onOk) {
      var self = this;
      this._confirmCb = onOk;
      this.openModal('<h2>确认</h2><div class="archive-lines">' + E(text) + '</div>'
        + '<div class="modal-actions">'
        + '<button class="btn" data-act="modal-close">取消</button>'
        + '<button class="btn danger" data-act="modal-ok">确认</button>'
        + '</div>');
    },

    /* ---------- 日志 / 通知 / 台词 ---------- */
    log: function (text, cruel) {
      this.archiveLog.unshift({ t: DG.util.clock(), text: text, cruel: !!cruel });
      if (this.archiveLog.length > 60) this.archiveLog.pop();
      if (this.view === 'compartment') this.renderCompartment();
    },
    casinoLogAdd: function (text, cruel) {
      this.casinoLog.unshift({ t: DG.util.clock(), text: text, cruel: !!cruel });
      if (this.casinoLog.length > 40) this.casinoLog.pop();
    },

    notify: function (text) {
      var el = document.getElementById('notice');
      if (!el) {
        el = document.createElement('div');
        el.id = 'notice';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(this._noticeTimer);
      this._noticeTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
    },

    otakQuote: function () {
      var otak = DG.archive.byId(OTAC_ID);
      var quotes = (otak && otak.quotes && otak.quotes.length) ? otak.quotes : ['出现就是存在。'];
      this.otakQuoteIdx = (this.otakQuoteIdx + 1) % quotes.length;
      var el = document.getElementById('otak-bubble');
      if (el) el.textContent = quotes[this.otakQuoteIdx];
    },

    /* 挂机检测：技能树界面静默超过 60 秒，Ótakmarkað 说一句「你还在啊。」 */
    checkIdle: function (now) {
      if (this.view !== 'skilltree' || this.idleShown) return;
      if (now - this.lastInput < this.IDLE_MS) return;
      var el = document.getElementById('otak-bubble');
      if (el) el.textContent = this.IDLE_LINE;
      this.idleShown = true;
    },

    /* ---------- 事件委托 ---------- */
    onClick: function (e) {
      this.lastInput = Date.now();
      this.idleShown = false;
      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');
      var idx = t.getAttribute('data-idx');
      if (act === 'modal-mask' && e.target !== t) return; /* 点遮罩空白处不关，避免误触 */
      switch (act) {
        case 'contain-open': this.modalRoster(); break;
        case 'suppress': this.doSuppress(); break;
        case 'cell-remove':
          var self = this, u = this.game.cells[idx] && DG.archive.byId(this.game.cells[idx].unitId);
          this.modalConfirm('确认将「' + (u ? u.name : '该单位') + '」调离厢体？该格将空出。', function () {
            DG.state.removeAt(self.game, Number(idx));
            self.closeModal();
            self.log('调离：' + (u ? u.name : '该单位') + ' 已出册。');
            self.renderAll();
          });
          break;
        case 'skill-buy': this.doBuySkill(id); break;
        case 'faction-pick': this.pickFaction(id); break;
        case 'funeral-start': this.funeralStart(); break;
        case 'funeral-choice': this.funeralChoice(t.getAttribute('data-step'), id); break;
        case 'funeral-settle': this.funeralSettle(); break;
        case 'story-play': this.storyPlay(id); break;
        case 'go-casino': this.setView('casino'); break;
        case 'tier-select': this.onTierSelect(id); break;
        case 'house-open': this.houseOpen(); break;
        case 'bj-deal': this.bjDeal(); break;
        case 'bj-hit': this.bjHit(); break;
        case 'bj-stand': this.bjStand(); break;
        case 'bj-split': this.bjSplit(); break;
        case 'bj-double': this.bjDouble(); break;
        case 'game-tab': this.onGameTab(id); break;
        case 'chip-select': this.onChipSelect(Number(id)); break;
        case 'rl-bet': this.rlBet(id); break;
        case 'rl-clear': this.rlClear(); break;
        case 'rl-spin': this.rlSpin(); break;
        case 'sl-spin': this.slSpin(); break;
        case 'sb-bet': this.sbBet(id); break;
        case 'sb-clear': this.sbClear(); break;
        case 'sb-roll': this.sbRoll(); break;
        case 'bc-bet': this.bcBet(id); break;
        case 'bc-clear': this.bcClear(); break;
        case 'bc-deal': this.bcDeal(); break;
        case 'event-choice': this.onEventChoice(Number(idx)); break;
        case 'roster-contain': this.doContain(id); break;
        case 'modal-ok':
          if (this._confirmCb) this._confirmCb();
          this._confirmCb = null;
          break;
        case 'modal-close': this.closeModal(); break;
      }
    },

    onChange: function (e) {
      var t = e.target;
      var act = t.getAttribute && t.getAttribute('data-act');
      if (act === 'roster-world') { this.rosterFilter.world = t.value; this.modalRoster(); }
      else if (act === 'roster-rarity') { this.rosterFilter.rarity = t.value; this.modalRoster(); }
    },

    doContain: function (id) {
      var u = DG.archive.byId(id);
      var r = DG.state.contain(this.game, id, Date.now());
      if (!r.ok) { this.notify(r.err); this.modalRoster(); return; }
      this.log('收录 ' + (u ? u.name : id) + ' 至 №' + ('00' + (r.cellIndex + 1)).slice(-3) + '。');
      this.notify('已收容：' + (u ? u.name : id));
      this.closeModal();
      this.renderAll();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
