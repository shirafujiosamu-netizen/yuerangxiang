using System.Collections.Generic;
using Yueliangxiang;
using UnityEngine;

// 卡牌桌面（galgame 构图）：立绘在中间，手牌贴底，选中才上浮放大。
// 所有内容都是卡：道具 / 物资 / 武器 / 人物 / 技能 / 任务 / BUFF / DEBUFF /
// 剧情 / 遭遇 / 成长，靠 DrawCard 的 kind 与 tag 区分，不另做面板。
// 背包、任务栏、人物栏都排成手牌；可拖到角色位 / 接单区 / 丢弃区。
public class CardTable : MonoBehaviour
{
    GameState st = new GameState();

    class Drawn
    {
        public int idx = -1;
        public GameState.Case who;
        public Card card;
        public CardPile source;
        public Rect rect;
        public bool dragging;
        public Vector2 grab;
        public Zone zone;

        public string Title { get { return card != null ? card.def.title : (who != null ? who.name : ""); } }
        public string Kind { get { return card != null ? card.def.KindText : "案卷"; } }
        public string Tag { get { return card != null ? card.def.TagText : (who != null ? who.cause : ""); } }
        public string Body
        {
            get
            {
                if (card != null) return card.def.body;
                if (who != null) return who.cause + "　" + who.age + " 岁";
                return "";
            }
        }
    }

    readonly List<Drawn> hand = new List<Drawn>();
    readonly List<Drawn> drawerCards = new List<Drawn>();
    readonly CardPile bag = new CardPile(Zone.Bag);
    readonly CardPile quests = new CardPile(Zone.Quest);
    readonly CardPile persons = new CardPile(Zone.Person);
    readonly CardPile character = new CardPile(Zone.Character);
    readonly CardPile order = new CardPile(Zone.Order);
    readonly CardPile discard = new CardPile(Zone.Discard);

    readonly Campaign story = CardCatalog.Story();
    readonly SkillTree tree = CardCatalog.Tree();
    readonly System.Random rng = new System.Random();
    int storyRoll = -1;

    // —— 遭遇战：复用这套卡组，不另开界面 ——
    // enc-fields
    Encounter enc;
    int encHp, encSan, encRound;
    string encLog = "";

    Zone drawerZone = Zone.Bag;
    bool drawerOpen, showTree;
    int _uid = 1000;
    int day = 1;
    string log = "";
    bool showSet, _dayEnded;
    string hint = "把亡者牌拖到中间的接单处，或点当前工序直接推进。";
    static Texture2D _white;

    static readonly Color Ink = new Color(0.13f, 0.16f, 0.15f);
    static readonly Color Paper = new Color(0.97f, 0.96f, 0.92f);
    static readonly Color Amber = new Color(0.88f, 0.62f, 0.24f);
    static readonly Color Deep = new Color(0.08f, 0.10f, 0.11f);
    static readonly Color Dim = new Color(0.72f, 0.71f, 0.66f);

    public static void Boot()
    {
        var go = new GameObject("[CardTable]");
        go.AddComponent<CardTable>();
    }

    Texture2D face, frame, bg, eidos, sil;
    Texture2D[] backs = new Texture2D[5];

    void Awake()
    {
        face = Resources.Load<Texture2D>("UI/card_face");
        frame = Resources.Load<Texture2D>("UI/card_frame");
        eidos = Resources.Load<Texture2D>("Characters/eidos_bust");
        sil = Resources.Load<Texture2D>("Characters/eidos_silhouette");
        bg = Resources.Load<Texture2D>("Scenes/lobby_a");
        for (int i = 0; i < backs.Length; i++) backs[i] = Resources.Load<Texture2D>("UI/card_back_" + i);
        // 开局在菜单里定下的身份，进桌时灌进规则层
        st.playerName = GameState.ProfileName;
        st.playerGender = GameState.ProfileGender;
        DealDay();
    }

    void AddTo(CardPile pile, CardDef def)
    {
        if (def == null) return;
        pile.cards.Add(new Card(def, _uid++));
    }

    void DealDay()
    {
        hand.Clear(); drawerCards.Clear();
        bag.cards.Clear(); quests.cards.Clear(); persons.cards.Clear();
        character.cards.Clear(); order.cards.Clear(); discard.cards.Clear();

        var today = st.TodayCases();
        string nl = ((char)10).ToString();
        for (int i = 0; i < today.Length; i++)
        {
            var cs = st.DrawCase(today[i]);
            var def = new CardDef
            {
                id = "case_" + i, title = cs.name, kind = CardKind.Quest,
                school = School.None, star = 1,
                body = cs.cause + "　" + cs.age + " 岁" + nl + "身家 ¥" + cs.worth
                     + nl + "怨气 " + cs.grudgeNow + "/100"
            };
            var c = new Card(def, _uid++);
            hand.Add(new Drawn { idx = today[i], who = cs, card = c, source = quests, zone = Zone.Hand });
            quests.cards.Add(c);
        }

        foreach (var d in CardCatalog.Of(CardKind.Supply)) AddTo(bag, d);
        foreach (var d in CardCatalog.Of(CardKind.Item)) AddTo(bag, d);
        foreach (var d in CardCatalog.Of(CardKind.Weapon)) AddTo(bag, d);
        foreach (var d in CardCatalog.Of(CardKind.Skill)) AddTo(bag, d);
        foreach (var d in CardCatalog.Of(CardKind.Spell)) AddTo(bag, d);
        foreach (var d in CardCatalog.Of(CardKind.Ritual)) AddTo(bag, d);

        foreach (var d in CardCatalog.Of(CardKind.Clue)) AddTo(quests, d);
        foreach (var d in CardCatalog.Of(CardKind.Story)) AddTo(quests, d);
        foreach (var d in CardCatalog.Of(CardKind.Encounter)) AddTo(quests, d);
        foreach (var d in CardCatalog.Of(CardKind.Buff)) AddTo(quests, d);
        foreach (var d in CardCatalog.Of(CardKind.Debuff)) AddTo(quests, d);

        foreach (var d in CardCatalog.Of(CardKind.Person)) AddTo(persons, d);
        foreach (var d in CardCatalog.Of(CardKind.Vehicle)) AddTo(persons, d);
        foreach (var d in CardCatalog.Of(CardKind.Growth)) AddTo(persons, d);

        log = "第 " + day + " 天。桌上递来 " + today.Length + " 份单子。";
        hint = "把亡者牌拖到中间的接单处，或点当前工序直接推进。";
        RebuildDrawer();
    }

    CardPile PileOf(Zone z)
    {
        switch (z)
        {
            case Zone.Bag: return bag;
            case Zone.Quest: return quests;
            case Zone.Person: return persons;
            case Zone.Character: return character;
            case Zone.Order: return order;
            case Zone.Discard: return discard;
        }
        return bag;
    }

    void RebuildDrawer()
    {
        drawerCards.Clear();
        var pile = PileOf(drawerZone);
        for (int i = 0; i < pile.cards.Count && i < 10; i++)
            drawerCards.Add(new Drawn { card = pile.cards[i], source = pile, zone = drawerZone });
    }

    static bool _shot;

    void OnGUI()
    {
        // 手牌发完才拍，且持续刷新，避免拍到域重载后的空场
        if (Time.realtimeSinceStartup > 6f && hand.Count > 0
            && System.IO.File.Exists(Application.dataPath + "/.shot")
            && Time.frameCount % 120 == 0)
        {
            ScreenCapture.CaptureScreenshot("F:/job/oc-game/unity/_shots/card_full.png");
        }
        if (_white == null) { _white = new Texture2D(1, 1); _white.SetPixel(0, 0, Color.white); _white.Apply(); }

        float w = Screen.width, h = Screen.height, pad = Mathf.Max(16f, h * 0.03f);

        Fill(new Rect(0, 0, w, h), Deep);
        if (bg != null)
        {
            float k = Mathf.Max(w / bg.width, h / bg.height);
            float bw = bg.width * k, bh = bg.height * k;
            GUI.DrawTexture(new Rect((w - bw) * 0.5f, (h - bh) * 0.5f, bw, bh), bg, ScaleMode.StretchToFill, false);
        }
        Fill(new Rect(0, 0, w, h), new Color(0.04f, 0.05f, 0.06f, 0.55f));

        for (int i = 0; i < 24; i++)
        {
            float t = i / 24f;
            Fill(new Rect(0, 0, w * (0.30f - 0.26f * t) + 2f, h), new Color(0.03f, 0.035f, 0.05f, 0.055f));
        }

        var micro = UiStyle.Label(Mathf.RoundToInt(h * 0.017f), UiStyle.Faint);
        var stamp = UiStyle.Label(Mathf.RoundToInt(h * 0.017f), UiStyle.Faint);
        GUI.Label(new Rect(pad, pad - h * 0.006f, w * 0.6f, 18f), "月壤箱", micro);

        var big = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.042f), font = UiFont() };
        big.normal.textColor = UiStyle.Ink;
        GUI.Label(new Rect(pad, pad + h * 0.016f, w * 0.4f, h * 0.05f), "第 " + day.ToString("00") + " 天", big);

        var num = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.030f), font = UiFont() };
        num.normal.textColor = UiStyle.Dim;
        GUI.Label(new Rect(pad + w * 0.135f, pad + h * 0.022f, w * 0.5f, h * 0.04f),
                  "时辰 " + st.hours + "/6　钱 ¥" + st.money, num);

        GUI.Label(new Rect(pad, pad + h * 0.070f, w * 0.78f, 20f),
                  "官面 " + st.OfficialStage() + "（热度 " + st.officialHeat + "）　街坊 " + st.repStreet
                  + "　同业 " + st.repTrade + "　单 " + st.casesDone, stamp);

        if (st.hours <= 0 && !_dayEnded)
        {
            _dayEnded = true;
            log = st.EndDay(); day++; DealDay();
        }
        if (st.hours > 0) _dayEnded = false;

        float bw2 = 30f, gap2 = 6f;
        var zones = new[] { Zone.Bag, Zone.Quest, Zone.Person };
        var glyphs = new[] { "包", "单", "人" };
        for (int i = 0; i < 3; i++)
        {
            var r = new Rect(w - pad - bw2 - (4 - i) * (bw2 + gap2), pad, bw2, bw2);
            bool hot = r.Contains(Event.current.mousePosition);
            bool on = drawerOpen && drawerZone == zones[i];
            UiStyle.Frame(r, on || hot ? 0.85f : 0.28f, 6f);
            var s = UiStyle.Label(Mathf.RoundToInt(h * 0.018f), on ? UiStyle.Amber : UiStyle.Dim, TextAnchor.MiddleCenter);
            GUI.Label(r, glyphs[i], s);
            if (hot && Event.current.type == EventType.MouseDown)
            {
                if (on) drawerOpen = false;
                else { drawerZone = zones[i]; drawerOpen = true; showSet = false; showTree = false; RebuildDrawer(); }
                Event.current.Use();
            }
        }
        var treeR = new Rect(w - pad - bw2 - (bw2 + gap2), pad, bw2, bw2);
        bool treeHot = treeR.Contains(Event.current.mousePosition);
        UiStyle.Frame(treeR, showTree || treeHot ? 0.85f : 0.28f, 6f);
        GUI.Label(treeR, "树", UiStyle.Label(Mathf.RoundToInt(h * 0.018f),
                  showTree ? UiStyle.Amber : UiStyle.Dim, TextAnchor.MiddleCenter));
        if (treeHot && Event.current.type == EventType.MouseDown)
        {
            showTree = !showTree; drawerOpen = false; showSet = false; Event.current.Use();
        }
        var setR = new Rect(w - pad - bw2, pad, bw2, bw2);
        bool setHot = setR.Contains(Event.current.mousePosition);
        UiStyle.Frame(setR, setHot || showSet ? 0.85f : 0.28f, 6f);
        UiStyle.IconGear(setR, setHot || showSet ? UiStyle.Amber : UiStyle.Dim);
        if (setHot && Event.current.type == EventType.MouseDown)
        {
            showSet = !showSet; drawerOpen = false; showTree = false; Event.current.Use();
        }

        if (drawerOpen || showSet || showTree)
        {
            var pr2 = new Rect(w - pad - 320f, pad + 42f, 320f,
                               showSet ? 168f : (showTree ? 268f : 244f));
            Fill(pr2, new Color(0.045f, 0.05f, 0.06f, 0.96f));
            UiStyle.Frame(pr2, 0.55f, 8f);
            string head = showSet ? "设置" : showTree ? "技能树" : PileOf(drawerZone).Name;
            if (drawerOpen) head += " · " + PileOf(drawerZone).cards.Count + " 张";
            GUI.Label(new Rect(pr2.x + 12f, pr2.y + 8f, pr2.width - 24f, 20f), head,
                      UiStyle.Label(15, UiStyle.Amber));
            if (showSet)
            {
                string nl = ((char)10).ToString();
                GUI.Label(new Rect(pr2.x + 12f, pr2.y + 34f, pr2.width - 24f, pr2.height - 44f),
                          "速度：正常" + nl + "音效：暂未接" + nl + "存档：自动",
                          UiStyle.Label(12, UiStyle.Dim));
            }
            else if (showTree)
            {
                float ry = pr2.y + 34f;
                foreach (var n in tree.nodes)
                {
                    var row = new Rect(pr2.x + 12f, ry, pr2.width - 24f, 46f);
                    UiStyle.Fill(row, new Color(0.055f, 0.06f, 0.07f, 0.92f));
                    UiStyle.Frame(row, n.Taken ? 0.60f : 0.26f, 5f);
                    GUI.Label(new Rect(row.x + 8f, row.y + 4f, row.width - 104f, 18f),
                              n.title + " · " + CardDef.SchoolName(n.school),
                              UiStyle.Label(12, n.Taken ? UiStyle.Amber : UiStyle.Ink));
                    GUI.Label(new Rect(row.x + 8f, row.y + 23f, row.width - 104f, 16f),
                              n.numericNote, UiStyle.Label(10, UiStyle.Faint));
                    if (UiStyle.Button(new Rect(row.xMax - 90f, row.y + 9f, 82f, 28f),
                                       n.Taken ? "已点 " + n.level : "加点"))
                    {
                        var got = tree.Take(n);
                        if (got != null) persons.cards.Add(got);
                        log = n.title + " → " + n.numericNote
                            + (got != null ? "，获得「" + got.def.title + "」" : "（纯数值）");
                        hint = "非数值成长进人物栏，可以拖到角色位。";
                        showTree = false; drawerZone = Zone.Person; drawerOpen = true;
                        RebuildDrawer();
                    }
                    ry += 52f;
                }
            }
            else
            {
                float ch = 84f, cw = ch * 0.5625f, sp = 8f;
                for (int i = 0; i < drawerCards.Count; i++)
                {
                    var d = drawerCards[i];
                    int col = i % 5, row = i / 5;
                    if (!d.dragging)
                        d.rect = new Rect(pr2.x + 12f + col * (cw + sp),
                                          pr2.y + 34f + row * (ch + 10f), cw, ch);
                    DrawCard(d.rect, d.Title, d.Body, d.dragging, true, null, d.Kind, d.Tag);
                }
                GUI.Label(new Rect(pr2.x + 12f, pr2.yMax - 20f, pr2.width - 24f, 16f),
                          "拖到角色位 / 接单区 / 丢弃区", UiStyle.Label(11, UiStyle.Faint));
            }
        }

        int bays = 3;
        float pw = Mathf.Min(w * 0.19f, h * 0.34f);
        float gap = w * 0.015f;
        float total = bays * pw + (bays - 1) * gap;
        float bx = (w - total) * 0.5f;
        float bh2 = h * 0.58f;
        float by = h * 0.20f;
        for (int i = 0; i < bays; i++)
        {
            var pr = new Rect(bx + i * (pw + gap), by, pw, bh2);
            UiStyle.Frame(pr, 0.22f, 9f);
            GUI.Label(new Rect(pr.x + 6f, pr.yMax + 3f, pr.width, 14f), "BAY 0" + (i + 1), micro);
            if (i == 1 && eidos != null)
            {
                const float artFrac = 1666f / 2048f;
                float kScale = Screen.height * 0.88f / (eidos.height * artFrac);
                float iw = eidos.width * kScale, ih = eidos.height * kScale;
                var ir = new Rect(pr.center.x - iw * 0.5f, Screen.height - ih, iw, ih);
                GUI.DrawTexture(ir, eidos, ScaleMode.StretchToFill, true);
            }
        }
        var charR = new Rect(bx, by, total, bh2);

        for (int i = 0; i < character.cards.Count && i < 3; i++)
        {
            var c = character.cards[i];
            var r = new Rect(bx + i * (pw + gap) + pw * 0.28f, by + bh2 * 0.72f, pw * 0.44f, bh2 * 0.16f);
            DrawCard(r, c.def.title, c.def.body, false, true, null, c.def.KindText, c.def.TagText);
        }

        var stName = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.021f), alignment = TextAnchor.MiddleCenter, font = UiFont() };
        float scH = h * 0.105f, scW = Mathf.Max(scH * 0.5625f, w * 0.075f);
        float sy0 = h * 0.145f, sgap = h * 0.012f;
        for (int i = 0; i < GameState.Stages.Length; i++)
        {
            bool cur = st.active != null && st.activeStage == i;
            bool done = st.active != null && i < st.activeStage;
            var r = new Rect(pad, sy0 + i * (scH + sgap), scW, scH);

            UiStyle.Fill(r, new Color(0.045f, 0.05f, 0.06f, cur ? 0.92f : 0.70f));
            UiStyle.Frame(r, cur ? 0.95f : (done ? 0.30f : 0.20f), cur ? 8f : 5f);
            if (cur) UiStyle.Fill(new Rect(r.x, r.yMax - 2f, r.width, 2f), UiStyle.Amber);

            var idxS = UiStyle.Label(Mathf.RoundToInt(h * 0.014f), cur ? UiStyle.Amber : UiStyle.Faint, TextAnchor.MiddleCenter);
            GUI.Label(new Rect(r.x, r.y + scH * 0.10f, r.width, scH * 0.20f), "0" + (i + 1), idxS);

            stName.normal.textColor = cur ? UiStyle.Ink : done ? new Color(0.66f, 0.70f, 0.66f, 0.85f) : UiStyle.Dim;
            GUI.Label(new Rect(r.x + 2f, r.y + scH * 0.34f, r.width - 4f, scH * 0.44f), GameState.Stages[i], stName);
            GUI.Label(new Rect(r.x + 2f, r.yMax - scH * 0.20f, r.width - 4f, scH * 0.16f), "工序",
                      UiStyle.Label(Mathf.RoundToInt(scH * 0.10f), UiStyle.Faint, TextAnchor.MiddleCenter));

            if (r.Contains(Event.current.mousePosition) && Event.current.type == EventType.MouseDown)
            {
                if (cur) AdvanceStageByCard();
                else log = "工序按顺序办，先办亮着的那道。";
                Event.current.Use();
            }
        }

        if (st.active != null)
        {
            var r = new Rect(pad, h * 0.50f, h * 0.24f, h * 0.24f);
            DrawCard(r, st.active.name,
                     st.active.cause + "　" + st.active.age + " 岁" + (char)10
                     + "身家 ¥" + st.active.worth + (char)10 + "怨气 " + st.active.grudgeNow + "/100",
                     false, true, null, "案卷", st.active.cause);
        }

        if (st.active != null)
        {
            var opts = st.ChoicesFor(st.activeStage);
            float ch = h * 0.20f, cw = ch * 0.5625f;
            float span = opts.Count * cw + (opts.Count - 1) * 12f;
            float ox = (w - span) * 0.5f;
            float oy = h * 0.60f;
            for (int i = 0; i < opts.Count; i++)
            {
                var o = opts[i];
                var r = new Rect(ox + i * (cw + 12f), oy, cw, ch);
                bool ok = st.CanAfford(o) && st.CanChoose(o);
                string optBody = (o.cost > 0 ? "时辰 " + o.cost : "不花时辰");
                if (o.money != 0) optBody += (char)10 + "钱 " + (o.money > 0 ? "+" : "") + o.money;
                if (o.grudge != 0) optBody += (char)10 + "怨气 " + (o.grudge > 0 ? "+" : "") + o.grudge;
                DrawCard(r, o.label, optBody, false, ok, null, "干法", "");
                if (ok && r.Contains(Event.current.mousePosition) && Event.current.type == EventType.MouseDown)
                {
                    var res = st.Choose(i);
                    log = res.text;
                    if (res.done) { hint = "这一单结完了。"; if (st.hours <= 0) hand.Clear(); }
                    else hint = "下一道。";
                    Event.current.Use();
                }
            }
        }

        var bay = new Rect(w * 0.25f, h * 0.585f, w * 0.5f, h * 0.115f);
        UiStyle.Fill(bay, new Color(0.05f, 0.06f, 0.07f, 0.62f));
        UiStyle.Frame(bay, st.active == null ? 0.55f : 0.25f, 7f);
        var inS = UiStyle.Label(Mathf.RoundToInt(h * 0.019f), UiStyle.Dim, TextAnchor.MiddleCenter);
        GUI.Label(bay, st.active == null ? "接单区 · 把任务卡拖到这里" : "手上还有一单", inS);

        var dropR = new Rect(w - pad - 118f, h * 0.50f, 112f, h * 0.13f);
        UiStyle.Fill(dropR, new Color(0.05f, 0.06f, 0.07f, 0.55f));
        UiStyle.Frame(dropR, 0.30f, 6f);
        GUI.Label(dropR, "丢弃区 " + discard.cards.Count,
                  UiStyle.Label(Mathf.RoundToInt(h * 0.017f), UiStyle.Dim, TextAnchor.MiddleCenter));

        // —— 主线：剧情节点 → 技能检定 → 遭遇战（COC 式，复用同一套卡组） ——
        var node = story.Current;
        if (node != null)
        {
            var sr = new Rect(w - pad - 260f, h * 0.675f, 250f, h * 0.15f);
            UiStyle.Fill(sr, new Color(0.045f, 0.05f, 0.06f, 0.92f));
            UiStyle.Frame(sr, 0.42f, 7f);
            GUI.Label(new Rect(sr.x + 10f, sr.y + 6f, sr.width - 20f, 18f),
                      "主线 · " + node.title, UiStyle.Label(13, UiStyle.Amber));
            GUI.Label(new Rect(sr.x + 10f, sr.y + 26f, sr.width - 20f, 34f), node.text,
                      new GUIStyle(UiStyle.Label(11, UiStyle.Dim)) { wordWrap = true });
            bool endNode = string.IsNullOrEmpty(node.checkSkill);
            var sk = endNode ? null : CardCatalog.Get(node.checkSkill);
            string rollText = endNode ? "到这里为止" : storyRoll < 0
                ? "检定 · " + (sk != null ? sk.title : "技能")
                : "骰 " + storyRoll + (storyRoll >= node.difficulty ? " 成功" : " 失败");
            if (UiStyle.Button(new Rect(sr.x + 10f, sr.yMax - 30f, sr.width - 20f, 22f), rollText))
            {
                if (endNode) { story.Advance(true); log = "主线收在这里。"; hint = ""; }
                else storyRoll = Campaign.Roll(sk != null ? sk.dice : 4, 0, rng);
                bool ok = endNode || storyRoll >= node.difficulty;
                if (ok && node.clueIds != null)
                {
                    foreach (var cid in node.clueIds)
                    {
                        if (quests.cards.Exists(q => q.def != null && q.def.id == cid)) continue;
                        var cd = CardCatalog.Get(cid);
                        if (cd != null) { quests.Add(cd, rng.Next(1000, 9999)); log += "　得到线索「" + cd.title + "」"; }
                    }
                }
                story.Advance(ok);
                var next = story.Current;
                log = "检定 " + storyRoll + (ok ? " 成功" : " 失败")
                    + (next != null ? " → " + next.title : " → 主线结束");
                if (next != null && !string.IsNullOrEmpty(next.encounterId))
                {
                    Encounter e;
                    if (story.encounters.TryGetValue(next.encounterId, out e))
                    {
                        enc = e; encHp = 12; encSan = 6; encRound = 0; encLog = "";
                        log += " · 遭遇战：" + e.title;
                    }
                }
                hint = "遭遇战复用这套卡组，不另开界面。";
            }
        }

        // —— 遭遇战面板（同一套卡组，只是把攻击方式落到牌上） ——
        if (enc != null)
        {
            var er = new Rect(w - pad - 300f, h * 0.60f, 290f, h * 0.25f);
            UiStyle.Fill(er, new Color(0.05f, 0.045f, 0.05f, 0.95f));
            UiStyle.Frame(er, 0.55f, 8f);
            GUI.Label(new Rect(er.x + 12f, er.y + 8f, er.width - 24f, 20f),
                      enc.title, UiStyle.Label(14, UiStyle.Amber));
            GUI.Label(new Rect(er.x + 12f, er.y + 30f, er.width - 24f, 60f), enc.text,
                      new GUIStyle(UiStyle.Label(11, UiStyle.Dim)) { wordWrap = true });
            GUI.Label(new Rect(er.x + 12f, er.y + 94f, er.width - 24f, 18f),
                      "它 · 体力 " + encHp + "　你 · 理智 " + encSan + "　第 " + (encRound + 1) + " 回合",
                      UiStyle.Label(11, UiStyle.Ink));

            if (UiStyle.Button(new Rect(er.x + 12f, er.yMax - 58f, 126f, 22f), "出手"))
            {
                var atk = hand.Find(c => c.card != null && c.card.def.damage != DamageType.None);
                int dmg = atk != null ? atk.card.def.damageValue : 1;
                int faces = atk != null && atk.card.def.dice > 0 ? atk.card.def.dice : 4;
                int hit = Campaign.Roll(faces, 0, rng);
                bool ok2 = hit >= 5;
                if (ok2) { encHp -= dmg; hand.Remove(atk); }
                encRound++;
                encLog = ok2 ? "骰 " + hit + " 命中，" + dmg + " 点。" : "骰 " + hit + " 落空。";
                if (encHp <= 0)
                {
                    log = "遭遇战结束 · " + enc.title + " 退去。" + encLog;
                    if (!string.IsNullOrEmpty(enc.rewardCardId))
                    {
                        var rw = CardCatalog.Get(enc.rewardCardId);
                        if (rw != null) { bag.Add(rw, rng.Next(1000, 9999)); log += "　得到「" + rw.title + "」"; }
                    }
                    enc = null; encLog = "";
                    if (story.Current != null && !string.IsNullOrEmpty(story.Current.encounterId)) story.Advance(true);
                }
                else if (encRound % 2 == 0)
                {
                    int back = enc.nonHuman ? 2 : 1;
                    encSan -= back;
                    encLog += "　它反击，理智 -" + back + "。";
                    if (encSan <= 0)
                    {
                        log = "理智见底，你退了出来。" + encLog;
                        enc = null; encLog = ""; encSan = 3;
                    }
                }
            }
            if (UiStyle.Button(new Rect(er.x + 148f, er.yMax - 58f, 130f, 22f), "撤回"))
            {
                log = "你退回了台前。";
                enc = null; encLog = "";
            }
            if (!string.IsNullOrEmpty(encLog))
                GUI.Label(new Rect(er.x + 12f, er.yMax - 30f, er.width - 24f, 18f), encLog,
                          UiStyle.Label(11, UiStyle.Dim));
        }

        float hh = h * 0.20f, hw = hh * 0.5625f;
        float htotal = hand.Count * hw + Mathf.Max(0, hand.Count - 1) * 10f;
        float hx = Mathf.Max(pad, (w - htotal) * 0.5f);
        float hy = h - hh - h * 0.02f;
        for (int i = 0; i < hand.Count; i++)
        {
            var c = hand[i];
            if (!c.dragging) c.rect = new Rect(hx + i * (hw + 10f), hy, hw, hh);
            DrawCard(c.rect, c.Title, "", c.dragging, true, null, c.Kind, c.Tag);
        }

        UiStyle.Fill(new Rect(pad - 10f, h * 0.845f + 4f, 2f, 14f), UiStyle.Amber);
        var foot = UiStyle.Label(Mathf.RoundToInt(h * 0.019f), UiStyle.Dim);
        GUI.Label(new Rect(pad, h * 0.845f, w - pad * 2f, 22f), log + "　　" + hint, foot);

        HandleDrag(charR, bay, dropR);
    }

    void AdvanceStageByCard()
    {
        if (st.active == null) { log = "先在接单区接一单。"; return; }
        var opts = st.ChoicesFor(st.activeStage);
        for (int k = 0; k < opts.Count; k++)
        {
            if (!st.CanAfford(opts[k]) || !st.CanChoose(opts[k])) continue;
            var res = st.Choose(k);
            log = "工序卡 · " + GameState.Stages[st.activeStage] + " → " + opts[k].label + "。" + res.text;
            hint = res.done ? "这一单结完了。" : "下一道。";
            return;
        }
        log = "这道没有能用的干法。";
    }

    void HandleDrag(Rect charR, Rect bayR, Rect dropR)
    {
        var e = Event.current;
        bool needRebuild = false;
        if (e.type == EventType.MouseDown && e.button == 0)
        {
            for (int i = drawerCards.Count - 1; i >= 0; i--)
                if (drawerCards[i].rect.Contains(e.mousePosition))
                {
                    drawerCards[i].dragging = true;
                    drawerCards[i].grab = e.mousePosition - new Vector2(drawerCards[i].rect.x, drawerCards[i].rect.y);
                    e.Use(); return;
                }
            for (int i = hand.Count - 1; i >= 0; i--)
                if (hand[i].rect.Contains(e.mousePosition))
                {
                    hand[i].dragging = true;
                    hand[i].grab = e.mousePosition - new Vector2(hand[i].rect.x, hand[i].rect.y);
                    e.Use(); return;
                }
        }
        else if (e.type == EventType.MouseDrag)
        {
            foreach (var c in drawerCards) if (c.dragging) { c.rect.x = e.mousePosition.x - c.grab.x; c.rect.y = e.mousePosition.y - c.grab.y; e.Use(); }
            foreach (var c in hand) if (c.dragging) { c.rect.x = e.mousePosition.x - c.grab.x; c.rect.y = e.mousePosition.y - c.grab.y; e.Use(); }
        }
        else if (e.type == EventType.MouseUp && e.button == 0)
        {
            for (int pass = 0; pass < 2; pass++)
            {
                var list = pass == 0 ? drawerCards : hand;
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    var c = list[i];
                    if (!c.dragging) continue;
                    c.dragging = false;
                    Zone target = Zone.Hand;
                    bool hit = false, legal = false;

                    if (dropR.Contains(e.mousePosition)) { target = Zone.Discard; hit = true; legal = true; }
                    else if (charR.Contains(e.mousePosition))
                    {
                        target = Zone.Character; hit = true;
                        legal = c.card != null && IsCharacterCard(c.card.def.kind);
                        if (legal && character.cards.Count >= 3) { legal = false; log = "三个角色位都满了。"; }
                    }
                    else if (bayR.Contains(e.mousePosition))
                    {
                        target = Zone.Order; hit = true;
                        legal = c.idx >= 0 && st.active == null;
                        if (legal) legal = st.StartCase(c.idx);
                        if (hit && !legal && st.active != null) log = "手上这单还没办完。";
                    }

                    if (hit && legal)
                    {
                        var pile = PileOf(target);
                        if (c.source != null && c.card != null) c.source.MoveTo(c.card, pile);
                        if (target == Zone.Character)
                        {
                            log = c.Title + " 落到角色位。";
                            hint = "人物 / 武器 / 技能已装备。";
                        }
                        else if (target == Zone.Order)
                        {
                            log = "接下 " + c.Title + "。";
                            hint = "点当前工序卡，直接推进这一道。";
                        }
                        else
                        {
                            log = c.Title + " 丢进丢弃区。";
                            hint = "丢弃区 " + discard.cards.Count + " 张。";
                        }
                        list.RemoveAt(i);
                        needRebuild = true;
                    }
                    else if (hit && !legal)
                    {
                        log = "这张卡不能放这里。";
                    }
                    e.Use();
                }
            }
        }
        if (needRebuild && drawerOpen) RebuildDrawer();
    }

    static bool IsCharacterCard(CardKind k)
    {
        switch (k)
        {
            case CardKind.Person:
            case CardKind.Weapon:
            case CardKind.Skill:
            case CardKind.Spell:
            case CardKind.Ritual:
            case CardKind.Vehicle:
            case CardKind.Growth:
            case CardKind.Buff:
                return true;
        }
        return false;
    }

    static Font _uiFont;
    static Font UiFont()
    {
        if (_uiFont != null) return _uiFont;
        _uiFont = Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "Arial" }, 24);
        return _uiFont;
    }

    static string CostLine(CardDef d)
    {
        if (d == null || d.costs == null || d.costs.Count == 0) return "";
        var sb = new System.Text.StringBuilder();
        for (int i = 0; i < d.costs.Count; i++)
        {
            if (i > 0) sb.Append("　");
            sb.Append(d.costs[i].Text);
        }
        return sb.ToString();
    }

    static string DamageLine(CardDef d)
    {
        if (d == null || d.damage == DamageType.None) return "";
        string t = d.damage == DamageType.Physical ? "物理" : (d.damage == DamageType.Magic ? "法术" : "精神");
        return t + " " + d.damageValue;
    }

    // 卡面属性区：占用/消耗、伤害、骰面，按 kind/tag 一并读出规则位置
    void DrawCard(Rect r, CardDef def, bool lifted, bool enabled = true)
    {
        if (def == null) return;
        string tag = def.TagText;
        string cost = CostLine(def);
        string dmg = DamageLine(def);
        string dice = def.dice > 0 ? "d" + def.dice : "";
        string attr = cost;
        if (!string.IsNullOrEmpty(dmg)) attr += (attr.Length > 0 ? "　" : "") + dmg;
        if (!string.IsNullOrEmpty(dice)) attr += (attr.Length > 0 ? "　" : "") + dice;
        DrawCard(r, def.title, def.body, lifted, enabled, null, def.KindText, tag, attr);
    }

    void DrawCard(Rect r, string title, string body, bool lifted, bool enabled = true, Texture2D back = null, string kind = "", string tag = "", string attr = "")
    {
        float ch = r.height, cw = ch * 0.5625f;
        var c = new Rect(r.x + (r.width - cw) * 0.5f, r.y, cw, ch);

        Fill(new Rect(c.x + 4f, c.y + 5f, c.width, c.height), new Color(0f, 0f, 0f, 0.45f));
        Fill(c, new Color(0.055f, 0.06f, 0.07f, 0.94f));
        UiStyle.Frame(c, lifted ? 0.95f : (enabled ? 0.42f : 0.20f), lifted ? 10f : 7f);

        UiStyle.Rule(c.x + 8f, c.y + ch * 0.085f, c.width - 16f, 0.18f);

        if (!string.IsNullOrEmpty(kind))
        {
            var ks = UiStyle.Label(Mathf.RoundToInt(ch * 0.050f), new Color(0.55f, 0.72f, 0.70f, enabled ? 0.95f : 0.35f));
            GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.085f, c.width - 18f, ch * 0.07f), kind, ks);
        }

        var titleStyle = UiStyle.Label(Mathf.RoundToInt(ch * 0.085f), enabled ? (lifted ? UiStyle.Amber : UiStyle.Ink) : UiStyle.Faint);
        GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.155f, c.width - 18f, ch * 0.16f), title, titleStyle);

        var bodyStyle = UiStyle.Label(Mathf.RoundToInt(ch * 0.058f), enabled ? UiStyle.Dim : UiStyle.Faint);
        GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.30f, c.width - 18f, ch * 0.5f), body, bodyStyle);

        if (!string.IsNullOrEmpty(attr))
        {
            var ac = UiStyle.Label(Mathf.RoundToInt(ch * 0.046f), new Color(0.72f, 0.68f, 0.60f, enabled ? 0.92f : 0.32f));
            GUI.Label(new Rect(c.x + 9f, c.yMax - ch * 0.128f, c.width - 18f, ch * 0.06f), attr, ac);
        }

        if (!string.IsNullOrEmpty(tag))
        {
            var ts = UiStyle.Label(Mathf.RoundToInt(ch * 0.046f), UiStyle.Dim);
            GUI.Label(new Rect(c.x + 9f, c.yMax - ch * 0.075f, c.width - 18f, ch * 0.06f), tag, ts);
        }

        if (lifted) Fill(new Rect(c.x, c.yMax - 2f, c.width, 2f), UiStyle.Amber);
    }

    static void Fill(Rect r, Color c)
    {
        var k = GUI.color; GUI.color = c; GUI.DrawTexture(r, _white); GUI.color = k;
    }

    static void Border(Rect r, Color c)
    {
        Fill(new Rect(r.x, r.y, r.width, 1f), c);
        Fill(new Rect(r.x, r.yMax - 1f, r.width, 1f), c);
        Fill(new Rect(r.x, r.y, 1f, r.height), c);
        Fill(new Rect(r.xMax - 1f, r.y, 1f, r.height), c);
    }
}
