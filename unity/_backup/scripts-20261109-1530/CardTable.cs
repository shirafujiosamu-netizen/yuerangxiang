using System.Collections.Generic;
using Yueliangxiang;
using UnityEngine;

// 卡牌桌面（galgame 构图）：立绘在中间，手牌贴底，选中才上浮放大。
// 规约：亡者牌拖到中下方「接单」区接单，干法牌点一下落进当前工序。规则交给 GameState。
// 六类卡共用 DrawCard：道具 / 物资 / 任务 / 人物 / BUFF / DEBUFF，靠 kind 与 tag 区分。
public class CardTable : MonoBehaviour
{
    GameState st = new GameState();

    class Drawn
    {
        public int idx;
        public GameState.Case who;
        public Rect rect;
        public bool dragging;
        public Vector2 grab;
    }

    readonly List<Drawn> hand = new List<Drawn>();
    int day = 1;
    string log = "";
    bool showBag, showSet, _dayEnded;
    string hint = "把下面的亡者牌拖到中间下方的接单处。";
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
    static bool _logged;
    Texture2D[] backs = new Texture2D[5];

    void Awake()
    {
        face = Resources.Load<Texture2D>("UI/card_face");
        frame = Resources.Load<Texture2D>("UI/card_frame");
        eidos = Resources.Load<Texture2D>("Characters/eidos_bust");
        sil = Resources.Load<Texture2D>("Characters/eidos_silhouette");
        bg = Resources.Load<Texture2D>("Scenes/lobby_a");
        for (int i = 0; i < backs.Length; i++) backs[i] = Resources.Load<Texture2D>("UI/card_back_" + i);
        DealDay();
    }

    void DealDay()
    {
        hand.Clear();
        var today = st.TodayCases();
        for (int i = 0; i < today.Length; i++)
            hand.Add(new Drawn { idx = today[i], who = st.DrawCase(today[i]) });
        log = $"第 {day} 天。桌上递来 {today.Length} 份单子。";
        hint = "把下面的亡者牌拖到中间下方的接单处。";
    }

    static bool _shot;

    void OnGUI()
    {
        if (!_shot && Time.time > 12f && System.IO.File.Exists(Application.dataPath + "/.shot"))
        {
            _shot = true;
            ScreenCapture.CaptureScreenshot("F:/job/oc-game/unity/_shots/card_full.png");
        }
        if (_white == null) { _white = new Texture2D(1, 1); _white.SetPixel(0, 0, Color.white); _white.Apply(); }

        float w = Screen.width, h = Screen.height, pad = Mathf.Max(16f, h * 0.03f);

        // 背景：大厅图铺满 + 压暗
        Fill(new Rect(0, 0, w, h), Deep);
        if (bg != null)
        {
            float k = Mathf.Max(w / bg.width, h / bg.height);
            float bw = bg.width * k, bh = bg.height * k;
            GUI.DrawTexture(new Rect((w - bw) * 0.5f, (h - bh) * 0.5f, bw, bh), bg, ScaleMode.StretchToFill, false);
        }
        Fill(new Rect(0, 0, w, h), new Color(0.04f, 0.05f, 0.06f, 0.55f));

        // 左缘暗角：让文字压在图上也能读，跟开始界面同一手法
        for (int i = 0; i < 24; i++)
        {
            float t = i / 24f;
            Fill(new Rect(0, 0, w * (0.30f - 0.26f * t) + 2f, h), new Color(0.03f, 0.035f, 0.05f, 0.055f));
        }

        // —— 顶栏：编号 + 大数字 + 一行技术标注 ——
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

        // 时辰走完 = 这一天结束，自动结算；不再单独设「打烊」按钮
        if (st.hours <= 0 && !_dayEnded)
        {
            _dayEnded = true;
            log = st.EndDay(); day++; DealDay();
        }
        if (st.hours > 0) _dayEnded = false;

        // 右上：背包 / 设置（细线框，点开各自的抽屉）
        var bagR = new Rect(w - pad - 34f, pad, 30f, 30f);
        var setR = new Rect(w - pad - 72f, pad, 30f, 30f);
        bool bagHot = bagR.Contains(Event.current.mousePosition);
        bool setHot = setR.Contains(Event.current.mousePosition);
        UiStyle.Frame(bagR, bagHot || showBag ? 0.85f : 0.28f, 6f);
        UiStyle.Frame(setR, setHot || showSet ? 0.85f : 0.28f, 6f);
        UiStyle.IconBag(bagR, bagHot || showBag ? UiStyle.Amber : UiStyle.Dim);
        UiStyle.IconGear(setR, setHot || showSet ? UiStyle.Amber : UiStyle.Dim);
        if (bagHot && Event.current.type == EventType.MouseDown) { showBag = !showBag; showSet = false; Event.current.Use(); }
        if (setHot && Event.current.type == EventType.MouseDown) { showSet = !showSet; showBag = false; Event.current.Use(); }


        // —— 背包 / 设置抽屉 ——
        if (showBag || showSet)
        {
            var pr2 = new Rect(w - pad - 300f, pad + 42f, 300f, showBag ? 208f : 168f);
            Fill(pr2, new Color(0.045f, 0.05f, 0.06f, 0.96f));
            UiStyle.Frame(pr2, 0.55f, 8f);
            var hd = UiStyle.Label(15, UiStyle.Amber);
            GUI.Label(new Rect(pr2.x + 12f, pr2.y + 10f, pr2.width - 24f, 20f), showBag ? "随身" : "设置", hd);
            var body2 = UiStyle.Label(12, UiStyle.Dim);
            string nl = ((char)10).ToString();
            string txt = showBag
                ? "香烛 ×" + st.incense + nl + "寿衣料 ×" + st.cloth + nl + "徒弟 " + (st.hiredApprentice ? "在" : "无")
                  + "　化妆师 " + (st.hiredMakeup ? "在" : "无") + "　司仪 " + (st.hiredEmcee ? "在" : "无")
                : "速度：正常" + nl + "音效：暂未接" + nl + "存档：自动";
            GUI.Label(new Rect(pr2.x + 12f, pr2.y + 34f, pr2.width - 24f, pr2.height - 44f), txt, body2);
        }

        // —— 立绘位：细线框 + BAY 编号 ——
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

        // —— 左侧工序轨：五道工序做成小卡，当前道琥珀描边 ——
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
        }

        if (st.active != null)
        {
            var r = new Rect(pad, h * 0.50f, h * 0.24f, h * 0.24f);
            DrawCard(r, st.active.name, st.active.cause + "　" + st.active.age + " 岁" + (char)10 + "身家 ¥" + st.active.worth + (char)10 + "怨气 " + st.active.grudgeNow + "/100", false);
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
                DrawCard(r, o.label, optBody, false, ok, null, "工序", "");
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

        // —— 接单口：虚框 + 小字提示 ——
        var bay = new Rect(w * 0.25f, h * 0.585f, w * 0.5f, h * 0.115f);
        UiStyle.Fill(bay, new Color(0.05f, 0.06f, 0.07f, 0.62f));
        UiStyle.Frame(bay, st.active == null ? 0.55f : 0.25f, 7f);
        var inS = UiStyle.Label(Mathf.RoundToInt(h * 0.019f), UiStyle.Dim, TextAnchor.MiddleCenter);
        GUI.Label(bay, st.active == null ? "接单处 · 把亡者牌拖到这里" : "手上还有一单", inS);

        // —— 手牌 ——
        float hh = h * 0.20f, hw = hh * 0.5625f;
        float htotal = hand.Count * hw + Mathf.Max(0, hand.Count - 1) * 10f;
        float hx = Mathf.Max(pad, (w - htotal) * 0.5f);
        float hy = h - hh - h * 0.02f;
        for (int i = 0; i < hand.Count; i++)
        {
            var c = hand[i];
            if (!c.dragging) c.rect = new Rect(hx + i * (hw + 10f), hy, hw, hh);
            DrawCard(c.rect, c.who.name, "", c.dragging, true, null, "案卷", c.who.cause);
        }

        // —— 底部一行：日志 + 提示 ——
        UiStyle.Fill(new Rect(pad - 10f, h * 0.845f + 4f, 2f, 14f), UiStyle.Amber);
        var foot = UiStyle.Label(Mathf.RoundToInt(h * 0.019f), UiStyle.Dim);
        GUI.Label(new Rect(pad, h * 0.845f, w - pad * 2f, 22f), log + "　　" + hint, foot);

        HandleDrag();
    }

    void DrawIconButton(Rect r, string glyph, string tip)
    {
        Fill(r, new Color(0.16f, 0.18f, 0.19f, 0.85f));
        Border(r, new Color(0.45f, 0.46f, 0.44f, 0.7f));
        var s = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(Screen.height * 0.019f), alignment = TextAnchor.MiddleCenter };
        s.normal.textColor = Paper;
        GUI.Label(r, glyph, s);
        if (r.Contains(Event.current.mousePosition) && Event.current.type == EventType.MouseDown)
        {
            log = tip;
            Event.current.Use();
        }
    }

    void HandleDrag()
    {
        var e = Event.current;
        if (e.type == EventType.MouseDown && e.button == 0)
        {
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
            foreach (var c in hand) if (c.dragging) { c.rect.x = e.mousePosition.x - c.grab.x; c.rect.y = e.mousePosition.y - c.grab.y; e.Use(); }
        }
        else if (e.type == EventType.MouseUp && e.button == 0)
        {
            var bay = new Rect(Screen.width * 0.25f, Screen.height * 0.55f, Screen.width * 0.5f, Screen.height * 0.30f);
            for (int i = hand.Count - 1; i >= 0; i--)
            {
                var c = hand[i];
                if (!c.dragging) continue;
                c.dragging = false;
                if (bay.Contains(e.mousePosition))
                {
                    if (st.active != null) { hint = "手上这单还没办完。"; }
                    else if (st.StartCase(c.idx))
                    {
                        hand.RemoveAt(i);
                        log = $"接下 {c.who.name}。";
                        hint = "点一张干法牌，落进亮着的那道。";
                    }
                }
                e.Use();
            }
        }
    }

    static Font _uiFont;
    static Font UiFont()
    {
        if (_uiFont != null) return _uiFont;
        _uiFont = Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "Arial" }, 24);
        return _uiFont;
    }

    void DrawCard(Rect r, string title, string body, bool lifted, bool enabled = true, Texture2D back = null, string kind = "", string tag = "")
    {
        float ch = r.height, cw = ch * 0.5625f;
        var c = new Rect(r.x + (r.width - cw) * 0.5f, r.y, cw, ch);

        Fill(new Rect(c.x + 4f, c.y + 5f, c.width, c.height), new Color(0f, 0f, 0f, 0.45f));
        Fill(c, new Color(0.055f, 0.06f, 0.07f, 0.94f));
        UiStyle.Frame(c, lifted ? 0.95f : (enabled ? 0.42f : 0.20f), lifted ? 10f : 7f);

        UiStyle.Rule(c.x + 8f, c.y + ch * 0.085f, c.width - 16f, 0.18f);

        // 卡的类型小字：案卷 / 道具 / 物资 / 人物 / BUFF / DEBUFF 都走这里
        if (!string.IsNullOrEmpty(kind))
        {
            var ks = UiStyle.Label(Mathf.RoundToInt(ch * 0.050f), new Color(0.55f, 0.72f, 0.70f, enabled ? 0.95f : 0.35f));
            GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.085f, c.width - 18f, ch * 0.07f), kind, ks);
        }

        var titleStyle = UiStyle.Label(Mathf.RoundToInt(ch * 0.085f), enabled ? (lifted ? UiStyle.Amber : UiStyle.Ink) : UiStyle.Faint);
        GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.155f, c.width - 18f, ch * 0.16f), title, titleStyle);

        var bodyStyle = UiStyle.Label(Mathf.RoundToInt(ch * 0.058f), enabled ? UiStyle.Dim : UiStyle.Faint);
        GUI.Label(new Rect(c.x + 9f, c.y + ch * 0.30f, c.width - 18f, ch * 0.5f), body, bodyStyle);

        if (!string.IsNullOrEmpty(tag))
        {
            var ts = UiStyle.Label(Mathf.RoundToInt(ch * 0.048f), UiStyle.Dim);
            GUI.Label(new Rect(c.x + 9f, c.yMax - ch * 0.085f, c.width - 18f, ch * 0.07f), tag, ts);
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
