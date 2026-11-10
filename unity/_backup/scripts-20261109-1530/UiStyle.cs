using UnityEngine;

// 全局 UI 语汇：黑底、米白细线、琥珀强调、角标与编号
static class UiStyle
{
    public static readonly Color Ink = new Color(0.93f, 0.90f, 0.84f, 1f);
    public static readonly Color Dim = new Color(0.93f, 0.90f, 0.84f, 0.55f);
    public static readonly Color Faint = new Color(0.93f, 0.90f, 0.84f, 0.28f);
    public static readonly Color Amber = new Color(0.88f, 0.62f, 0.24f, 1f);
    public static readonly Color Deep = new Color(0.05f, 0.055f, 0.065f, 1f);

    static Texture2D _px;

    

    public static void Fill(Rect r, Color c)
    {
        var keep = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Px(), ScaleMode.StretchToFill);
        GUI.color = keep;
    }

    public static void Rule(float x, float y, float len, float alpha = 0.28f, bool vertical = false)
    {
        Fill(vertical ? new Rect(x, y, 1f, len) : new Rect(x, y, len, 1f), new Color(Ink.r, Ink.g, Ink.b, alpha));
    }

    // 细线框 + 四角短标（整套 UI 的记号）
    public static void Frame(Rect r, float alpha = 0.30f, float tick = 7f)
    {
        var c = new Color(Ink.r, Ink.g, Ink.b, alpha);
        Rule(r.x, r.y, r.width, alpha);
        Rule(r.x, r.yMax, r.width, alpha);
        Rule(r.x, r.y, r.height, alpha, true);
        Rule(r.xMax, r.y, r.height, alpha, true);
        // 四角加粗一小段，像技术图
        var t = new Color(Ink.r, Ink.g, Ink.b, Mathf.Min(1f, alpha * 2.2f));
        Fill(new Rect(r.x, r.y, tick, 1.6f), t);
        Fill(new Rect(r.x, r.y, 1.6f, tick), t);
        Fill(new Rect(r.xMax - tick, r.y, tick, 1.6f), t);
        Fill(new Rect(r.xMax - 1.6f, r.y, 1.6f, tick), t);
        Fill(new Rect(r.x, r.yMax - 1.6f, tick, 1.6f), t);
        Fill(new Rect(r.x, r.yMax - tick, 1.6f, tick), t);
        Fill(new Rect(r.xMax - tick, r.yMax - 1.6f, tick, 1.6f), t);
        Fill(new Rect(r.xMax - 1.6f, r.yMax - tick, 1.6f, tick), t);
    }

    public static GUIStyle Label(int size, Color col, TextAnchor anchor = TextAnchor.MiddleLeft, bool bold = false)
    {
        var s = new GUIStyle(GUI.skin.label)
        {
            fontSize = Mathf.Max(9, size),
            alignment = anchor,
            wordWrap = false,
            richText = false
        };
        if (bold) s.fontStyle = FontStyle.Bold;
        s.normal.textColor = col;
        return s;
    }

    // 编号行：01 新游戏
    public static void NumberedRow(Rect r, int index, string text, bool active, bool hover)
    {
        var num = Label(Mathf.RoundToInt(r.height * 0.62f), active ? Amber : Faint);
        GUI.Label(new Rect(r.x, r.y, 34f, r.height), index.ToString("00"), num);

        var lab = Label(Mathf.RoundToInt(r.height * 0.78f), active || hover ? Ink : Dim);
        GUI.Label(new Rect(r.x + 38f, r.y, r.width - 38f, r.height), text, lab);

        var line = active ? Amber : new Color(Ink.r, Ink.g, Ink.b, hover ? 0.42f : 0.16f);
        Fill(new Rect(r.x + 38f, r.yMax - 1f, r.width - 38f, active ? 1.6f : 1f), line);
        if (active) Fill(new Rect(r.x, r.y + 4f, 2f, r.height - 8f), Amber);
    }

    // 细线按钮：悬停变琥珀
    public static bool Button(Rect r, string text, bool enabled = true)
    {
        bool hover = enabled && r.Contains(Event.current.mousePosition);
        Frame(r, hover ? 0.75f : 0.34f, 5f);
        var s = Label(Mathf.RoundToInt(r.height * 0.46f), enabled ? (hover ? Amber : Ink) : Faint, TextAnchor.MiddleCenter);
        GUI.Label(r, text, s);
        if (hover && Event.current.type == EventType.MouseDown)
        {
            Event.current.Use();
            return true;
        }
        return false;
    }

    // 小标签：细框里的说明字

    // —— 线稿图标：跟界面同一套笔触（细线 + 少即是多） ——
        static Texture2D Px()
    {
        if (_px == null) { _px = new Texture2D(1, 1); _px.SetPixel(0, 0, Color.white); _px.Apply(); }
        return _px;
    }

    public static void Stroke(Vector2 a, Vector2 b, float thick, Color c)
    {
        var d = b - a; float len = d.magnitude; if (len < 0.01f) return;
        float ang = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
        var keep = GUI.color; GUI.color = c;
        GUIUtility.RotateAroundPivot(ang, a);
        GUI.DrawTexture(new Rect(a.x, a.y - thick * 0.5f, len, thick), Px(), ScaleMode.StretchToFill);
        GUIUtility.RotateAroundPivot(-ang, a);
        GUI.color = keep;
    }

    public static void IconGear(Rect r, Color c)
    {
        var m = r.center; float rad = r.width * 0.26f;
        const int seg = 24;
        for (int i = 0; i < seg; i++)
        {
            float a0 = i * Mathf.PI * 2f / seg, a1 = (i + 1) * Mathf.PI * 2f / seg;
            Stroke(m + new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * rad,
                   m + new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * rad, 1.4f, c);
        }
        for (int i = 0; i < 8; i++)
        {
            float a = i * Mathf.PI * 0.25f;
            var dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
            Stroke(m + dir * rad, m + dir * (rad * 1.42f), 1.6f, c);
        }
        float ir = rad * 0.34f;
        for (int i = 0; i < 12; i++)
        {
            float a0 = i * Mathf.PI * 2f / 12, a1 = (i + 1) * Mathf.PI * 2f / 12;
            Stroke(m + new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * ir,
                   m + new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * ir, 1.2f, c);
        }
    }

    public static void IconBag(Rect r, Color c)
    {
        float x = r.x + r.width * 0.22f, y = r.y + r.height * 0.34f;
        float bw = r.width * 0.56f, bh2 = r.height * 0.40f;
        Stroke(new Vector2(x, y), new Vector2(x + bw, y), 1.5f, c);
        Stroke(new Vector2(x + bw, y), new Vector2(x + bw, y + bh2), 1.5f, c);
        Stroke(new Vector2(x + bw, y + bh2), new Vector2(x, y + bh2), 1.5f, c);
        Stroke(new Vector2(x, y + bh2), new Vector2(x, y), 1.5f, c);
        // 提手
        var l = new Vector2(x + bw * 0.26f, y);
        var rr2 = new Vector2(x + bw * 0.74f, y);
        Stroke(l, new Vector2(l.x, y - r.height * 0.10f), 1.4f, c);
        Stroke(rr2, new Vector2(rr2.x, y - r.height * 0.10f), 1.4f, c);
        Stroke(new Vector2(l.x, y - r.height * 0.10f), new Vector2(rr2.x, y - r.height * 0.10f), 1.4f, c);
        // 锁扣
        Stroke(new Vector2(x + bw * 0.40f, y), new Vector2(x + bw * 0.60f, y), 2.2f, c);
    }

    public static void Tag(Rect r, string text, bool hot = false)
    {
        var s = Label(Mathf.RoundToInt(r.height * 0.86f), hot ? Amber : Faint, TextAnchor.MiddleCenter);
        GUI.Label(r, text, s);
    }
}
