using UnityEngine;

// 场景服从界面：星星与星团都是"画"出来的图形，各有各的样子
static class MenuGfx
{
    static Texture2D _px, _dot, _cross, _spark, _ring, _disc, _star6, _star4;

    public static float ViewAngle;                 // 整幅星图一起转
    public static readonly float[] Spin = new float[5];   // 每颗自己的自转
    public static int Selected = -1;
    public static int Mode;   // 0=主菜单；1=选星球（放大、居中、水平）
    static float _blend;      // 0→1 的缓动，别让整组布局瞬移               // 被点中的天体
    static readonly Vector2[] _pos = new Vector2[5];
    static readonly float[] _size = new float[5];

    public static int Pick(Vector2 mouse, float w, float h)
    {
        int best = -1; float bestD = float.MaxValue;
        for (int i = 0; i < 5; i++)
        {
            float r = Mathf.Max(_size[i] * 0.9f, Mathf.Min(w, h) * 0.06f);
            float d = Vector2.Distance(mouse, _pos[i]);
            if (d < r && d < bestD) { bestD = d; best = i; }
        }
        return best;
    }
    static Vector2[] _bgStars;
    static float[] _bgSize, _bgKind;

    static Color Ink = new Color(0.93f, 0.90f, 0.84f, 1f);

    public static void Draw(float w, float h, float margin, float t)
    {
        if (_bgStars == null) BuildBg();

        // —— 背景星：三种画法（圆点 / 十字 / 星芒），各带一点漂移 ——
        for (int i = 0; i < _bgStars.Length; i++)
        {
            float drift = t * (0.10f + (i % 5) * 0.06f);
            float x = Mathf.Repeat(_bgStars[i].x * w + drift * 0.5f, w);
            float y = _bgStars[i].y * h;
            // 星空只在拖空白处时整体旋转；拖星球不应带动背景
            if (Mathf.Abs(ViewAngle) > 0.001f) {
                var ip = new Vector2(x - w * 0.5f, y - h * 0.5f) * (Mode == 1 ? 1.14f : 1f);
                float ca = Mathf.Cos(ViewAngle * Mathf.Deg2Rad), sa = Mathf.Sin(ViewAngle * Mathf.Deg2Rad);
                x = w * 0.5f + ip.x * ca - ip.y * sa;
                y = h * 0.5f + ip.x * sa + ip.y * ca;
                if (x < -20f || x > w + 20f || y < -20f || y > h + 20f) continue;
            }
            float s = _bgSize[i];
            Texture2D tex = _bgKind[i] < 0.08f ? Cross() : (_bgKind[i] < 0.20f ? Spark() : (_bgKind[i] < 0.45f ? Cross() : Dot()));
            GUI.color = new Color(1f, 1f, 1f, 0.40f + 0.45f * ((i % 7) / 7f));
            GUI.DrawTexture(new Rect(x, y, s, s), tex, ScaleMode.StretchToFill);
        }
        GUI.color = Color.white;


        // —— 底纹：一颗很大的、极淡的多角对称星 ——
        {
            // 放在左上角，做成细长的四芒 + 短斜芒，像真正的星芒而不是蜘蛛网
            var bc = new Vector2(w * 0.20f, h * 0.24f);
            float R = Mathf.Min(w, h) * 0.34f;
            float rot = 0.16f + Time.time * 0.004f;
            var dirs = new float[] { 0f, Mathf.PI * 0.5f, Mathf.PI, Mathf.PI * 1.5f };
            foreach (float a0 in dirs)
            {
                var d = new Vector2(Mathf.Cos(a0 + rot), Mathf.Sin(a0 + rot));
                Line(bc - d * R, bc + d * R, 1.1f, 0.085f);
            }
            foreach (float a0 in new float[] { 0.785f, 2.356f, 3.927f, 5.498f })
            {
                var d = new Vector2(Mathf.Cos(a0 + rot), Mathf.Sin(a0 + rot));
                Line(bc - d * R * 0.42f, bc + d * R * 0.42f, 1f, 0.05f);
            }
        }

        // —— 另外两个“维度”：不是复制，而是各自的语言 ——
        // B：同心正圆 + 虚线环 + 点阵天体，像旧天文图
        {
            var c2 = new Vector2(w * 0.78f, h * 0.80f);
            float baseR = Mathf.Min(w, h) * 0.13f;
            for (int r = 0; r < 4; r++)
            {
                float rad = baseR * (0.45f + 0.30f * r);
                int seg = 96;
                for (int k = 0; k < seg; k += 2)     // 隔一段画一段 → 虚线
                {
                    float a0 = k / (float)seg * Mathf.PI * 2f;
                    float a1 = (k + 1) / (float)seg * Mathf.PI * 2f;
                    var p0 = c2 + new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * rad;
                    var p1 = c2 + new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * rad;
                    Line(p0, p1, 1f, 0.14f);
                }
                // 环上点阵
                int dots = 10 + r * 4;
                for (int d = 0; d < dots; d++)
                {
                    float a = d / (float)dots * Mathf.PI * 2f - t * (0.05f + 0.02f * r) * (r % 2 == 0 ? 1f : -1f);
                    var pt = c2 + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * rad;
                    GUI.color = new Color(1f, 1f, 1f, 0.16f);
                    GUI.DrawTexture(new Rect(pt.x - 1.4f, pt.y - 1.4f, 2.8f, 2.8f), Dot(), ScaleMode.StretchToFill);
                }
                GUI.color = Color.white;
            }
        }

        float layoutK = Mode == 1 ? 1.44f : 1.14f;
        float centreX = Mode == 1 ? w * 0.50f : w * 0.60f;
        DrawSystem(0, new Vector2(centreX, h * 0.50f), layoutK,
                   new float[] { -19f, 7f, 27f, -6f, 15f }, 1f, 0f, 0, w, h, t);
    }

    static void DrawSystem(int id, Vector2 centre, float k, float[] tilts, float fade,
                           float phaseSeed, int glyphOffset, float w, float h, float t)
    {
        var keepCol = GUI.color;
        for (int i = 0; i < 5; i++)
        {
            float ea = w * (0.15f + 0.045f * i) * k;
            float eb = h * (0.085f + 0.023f * i) * k;
            float tilt = tilts[i] * (id == 0 ? 1f : 1f) + ViewAngle * (id == 0 ? 1f : 0.35f);
            float speed = 0.150f * Mathf.Pow(0.15f / (0.15f + 0.045f * i), 1.5f);
            float ph = i * 2.399963f + phaseSeed - t * speed;

            // 轨道：用折线画整圈（闭合），避免贴图拉伸导致的端点缺口
            {
                float rr = tilt * Mathf.Deg2Rad;
                float cr = Mathf.Cos(rr), sr = Mathf.Sin(rr);
                int segs = 96;
                var prev = Vector2.zero;
                for (int q = 0; q <= segs; q++)
                {
                    float aa = q / (float)segs * Mathf.PI * 2f;
                    var lp = new Vector2(Mathf.Cos(aa) * ea, Mathf.Sin(aa) * eb);
                    var sp = new Vector2(centre.x + lp.x * cr - lp.y * sr, centre.y + lp.x * sr + lp.y * cr);
                    if (q > 0) Line(prev, sp, i % 3 == 0 ? 1.5f : (i % 3 == 1 ? 1.2f : 1f), 0.20f * fade + 0.06f);
                    prev = sp;
                }
            }

            float rad = tilt * Mathf.Deg2Rad;
            float ex = Mathf.Cos(ph) * ea, ey = Mathf.Sin(ph) * eb;
            var pos = new Vector2(centre.x + ex * Mathf.Cos(rad) - ey * Mathf.Sin(rad),
                                  centre.y + ex * Mathf.Sin(rad) + ey * Mathf.Cos(rad));

            float size = Mathf.Min(w, h) * (0.075f + 0.012f * (i % 3)) * (id == 0 ? 1f : 0.62f);
            if (id == 0) size *= Selected == i ? 1.85f : (Selected >= 0 ? 0.78f : 1f);
            if (id == 0) { _pos[i] = pos; _size[i] = size; }

            GUI.color = new Color(1f, 1f, 1f, Mathf.Lerp(0.35f, 1f, fade));
            Glyph((i + glyphOffset) % 5, pos, size, Spin[i] + t * (18f + i * 8f) * (i % 2 == 0 ? 1f : -1f));
            Cluster(i + glyphOffset, pos, size, t + phaseSeed);
        }
        GUI.color = keepCol;
    }

    static void Glyph(int idx, Vector2 c, float s, float rotDeg)
    {
        GUIUtility.RotateAroundPivot(rotDeg, c);
        switch (idx)
        {
            case 0: // 空心四角星（线稿，不用发光点）
                GUI.DrawTexture(new Rect(c.x - s * 0.62f, c.y - s * 0.62f, s * 1.24f, s * 1.24f), Star4(), ScaleMode.StretchToFill);
                break;

            case 1: // 六芒星（两个空心三角）
                GUI.DrawTexture(new Rect(c.x - s * 0.5f, c.y - s * 0.5f, s, s), Star6(), ScaleMode.StretchToFill);
                break;

            case 2: // 圆环 + 辐条
                GUI.DrawTexture(new Rect(c.x - s * 0.5f, c.y - s * 0.5f, s, s), Ring(), ScaleMode.StretchToFill);
                for (int k = 0; k < 6; k++)
                {
                    float deg = k * 60f;
                    GUIUtility.RotateAroundPivot(deg, c);
                    GUI.DrawTexture(new Rect(c.x + s * 0.10f, c.y - 0.5f, s * 0.34f, 1f), Px(), ScaleMode.StretchToFill);
                    GUIUtility.RotateAroundPivot(-deg, c);
                }
                break;

            case 3: // 点阵球：一圈小点围成的空心圆
                for (int k = 0; k < 18; k++)
                {
                    float a = k * Mathf.PI * 2f / 18f;
                    GUI.DrawTexture(new Rect(c.x + Mathf.Cos(a) * s * 0.46f, c.y + Mathf.Sin(a) * s * 0.46f, 3.2f, 3.2f), Dot(), ScaleMode.StretchToFill);
                }
                GUI.DrawTexture(new Rect(c.x - 2.6f, c.y - 2.6f, 5.2f, 5.2f), Dot(), ScaleMode.StretchToFill);
                break;

            default: // 细十字 + 小环
                GUI.DrawTexture(new Rect(c.x - s * 0.55f, c.y - 0.5f, s * 1.1f, 1f), Px(), ScaleMode.StretchToFill);
                GUI.DrawTexture(new Rect(c.x - 0.5f, c.y - s * 0.55f, 1f, s * 1.1f), Px(), ScaleMode.StretchToFill);
                GUI.DrawTexture(new Rect(c.x - s * 0.26f, c.y - s * 0.26f, s * 0.52f, s * 0.52f), Ring(), ScaleMode.StretchToFill);
                break;
        }
        GUIUtility.RotateAroundPivot(-rotDeg, c);
    }

    static void Cluster(int idx, Vector2 c, float s, float t)
    {
        int n = 12 + idx % 4;
        for (int k = 0; k < n; k++)
        {
            float a = k * (Mathf.PI * 2f / n) + t * (0.12f + 0.05f * (k % 3)) * (k % 2 == 0 ? 1f : -1f);
            float r = s * (1.05f + 0.95f * ((k % 6) / 6f) + 0.10f * ((k % 5) / 5f));
            float x = c.x + Mathf.Cos(a) * r;
            float y = c.y + Mathf.Sin(a) * r * 0.74f;
            switch (k % 4)
            {
                case 0:
                    if (k % 8 == 0)
                    {
                        // 少量短排线，像太阳能板那样收着用
                        float ang0 = ((k * 41) % 180) / 180f * Mathf.PI;
                        var d0 = new Vector2(Mathf.Cos(ang0), Mathf.Sin(ang0));
                        var n0 = new Vector2(-d0.y, d0.x);
                        for (int q = -1; q <= 1; q++)
                        {
                            var o = n0 * q * 2.6f;
                            Line(new Vector2(x, y) + o - d0 * 4.5f, new Vector2(x, y) + o + d0 * 4.5f, 1f, 0.42f);
                        }
                    }
                    else GUI.DrawTexture(new Rect(x - 7f, y - 7f, 14f, 14f), Ring(), ScaleMode.StretchToFill);
                    break;
                case 1: GUI.DrawTexture(new Rect(x - 3f, y - 3f, 6f, 6f), Dot(), ScaleMode.StretchToFill); break;
                case 2: GUI.DrawTexture(new Rect(x - 6f, y - 6f, 12f, 12f), Star4(), ScaleMode.StretchToFill); break;
                default: GUI.DrawTexture(new Rect(x - 8f, y - 8f, 16f, 16f), Star6(), ScaleMode.StretchToFill); break;
            }
        }
    }

    static Texture2D Star4()
    {
        if (_star4 != null) return _star4;
        const int S = 128;
        _star4 = new Texture2D(S, S, TextureFormat.RGBA32, false);
        float c = S * 0.5f;
        var pts = new Vector2[8];
        for (int k = 0; k < 8; k++)
        {
            float a = (-90f + k * 45f) * Mathf.Deg2Rad;
            float r = (k % 2 == 0) ? c * 0.95f : c * 0.26f;
            pts[k] = new Vector2(c + Mathf.Cos(a) * r, c + Mathf.Sin(a) * r);
        }
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                var pt = new Vector2(x + 0.5f, y + 0.5f);
                bool on = false;
                for (int k = 0; k < 8 && !on; k++)
                {
                    var a = pts[k]; var b = pts[(k + 1) % 8];
                    var ab = b - a; var ap = pt - a;
                    float tt = Mathf.Clamp01(Vector2.Dot(ap, ab) / Mathf.Max(0.001f, ab.sqrMagnitude));
                    on = (pt - (a + ab * tt)).sqrMagnitude < 1.3f * 1.3f;
                }
                _star4.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, on ? 0.85f : 0f));
            }
        _star4.Apply();
        return _star4;
    }

    static Texture2D Star6()
    {
        if (_star6 != null) return _star6;
        const int S = 256;
        _star6 = new Texture2D(S, S, TextureFormat.RGBA32, false);
        float c = S * 0.5f;
        var tri1 = new Vector2[3];
        var tri2 = new Vector2[3];
        for (int k = 0; k < 3; k++)
        {
            float a1 = -90f + k * 120f, a2 = 90f + k * 120f;
            tri1[k] = new Vector2(c + Mathf.Cos(a1 * Mathf.Deg2Rad) * c * 0.92f, c + Mathf.Sin(a1 * Mathf.Deg2Rad) * c * 0.92f);
            tri2[k] = new Vector2(c + Mathf.Cos(a2 * Mathf.Deg2Rad) * c * 0.92f, c + Mathf.Sin(a2 * Mathf.Deg2Rad) * c * 0.92f);
        }
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                var pt = new Vector2(x + 0.5f, y + 0.5f);
                bool e1 = NearEdge(tri1, pt, 1.4f) || NearEdge(tri2, pt, 1.4f);
                _star6.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, e1 ? 0.85f : 0f));
            }
        _star6.Apply();
        return _star6;
    }

    static bool NearEdge(Vector2[] tri, Vector2 p, float tol)
    {
        for (int i = 0; i < 3; i++)
        {
            var a = tri[i]; var b = tri[(i + 1) % 3];
            var ab = b - a; var ap = p - a;
            float tt = Mathf.Clamp01(Vector2.Dot(ap, ab) / Mathf.Max(0.001f, ab.sqrMagnitude));
            var proj = a + ab * tt;
            if ((p - proj).sqrMagnitude < tol * tol) return true;
        }
        return false;
    }

    static void Line(Vector2 a, Vector2 b, float thick, float alpha)
    {
        var d = b - a;
        float len = d.magnitude;
        float ang = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
        var keep = GUI.color;
        GUI.color = new Color(1f, 1f, 1f, alpha * keep.a);
        GUIUtility.RotateAroundPivot(ang, a);
        GUI.DrawTexture(new Rect(a.x, a.y - thick * 0.5f, len, thick), Px(), ScaleMode.StretchToFill);
        GUIUtility.RotateAroundPivot(-ang, a);
        GUI.color = keep;
    }

    static void BuildBg()
    {
        var rnd = new System.Random(20261108);
        int n = 320;
        _bgStars = new Vector2[n];
        _bgSize = new float[n];
        _bgKind = new float[n];
        for (int i = 0; i < n; i++)
        {
            _bgStars[i] = new Vector2((float)rnd.NextDouble(), (float)rnd.NextDouble());
            _bgKind[i] = (float)rnd.NextDouble();
            _bgSize[i] = 3f + (float)rnd.NextDouble() * 4f;
            if (_bgKind[i] < 0.08f) _bgSize[i] = 20f + (float)rnd.NextDouble() * 16f;   // 大十字
            else if (_bgKind[i] < 0.20f) _bgSize[i] = 12f + (float)rnd.NextDouble() * 10f; // 中星芒
            else if (_bgKind[i] < 0.45f) _bgSize[i] = 6f + (float)rnd.NextDouble() * 5f;  // 小十字
        }
    }

    static Texture2D Px()
    {
        if (_px != null) return _px;
        _px = new Texture2D(1, 1, TextureFormat.RGBA32, false);
        _px.SetPixel(0, 0, new Color(Ink.r, Ink.g, Ink.b, 0.85f));
        _px.Apply();
        return _px;
    }

    static Texture2D Dot()
    {
        if (_dot != null) return _dot;
        const int S = 16;
        _dot = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float dx = (x - 7.5f) / 7.5f, dy = (y - 7.5f) / 7.5f;
                float d = Mathf.Sqrt(dx * dx + dy * dy);
                _dot.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, d < 0.72f ? 1f : 0f));
            }
        _dot.Apply();
        return _dot;
    }

    static Texture2D Cross()
    {
        if (_cross != null) return _cross;
        const int S = 32;
        _cross = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float dx = Mathf.Abs(x - 15.5f) / 15.5f, dy = Mathf.Abs(y - 15.5f) / 15.5f;
                float a = (dx < 0.10f ? 1f - dy : 0f) + (dy < 0.10f ? 1f - dx : 0f);
                _cross.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, Mathf.Clamp01(a)));
            }
        _cross.Apply();
        return _cross;
    }

    static Texture2D Spark()
    {
        if (_spark != null) return _spark;
        const int S = 48;
        _spark = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float dx = Mathf.Abs(x - 23.5f) / 23.5f, dy = Mathf.Abs(y - 23.5f) / 23.5f;
                float a = (dx < 0.06f ? Mathf.Pow(1f - dy, 1.6f) : 0f) + (dy < 0.06f ? Mathf.Pow(1f - dx, 1.6f) : 0f);
                _spark.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, Mathf.Clamp01(a)));
            }
        _spark.Apply();
        return _spark;
    }

    static Texture2D[] _ellipseTex;
    static Texture2D Ellipse(int idx)
    {
        if (_ellipseTex == null) _ellipseTex = new Texture2D[1];
        if (_ellipseTex[0] != null) return _ellipseTex[0];
        const int W = 1024, H = 256;
        var tex = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float a = W * 0.5f, b = H * 0.5f;
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                float nx = (x - W * 0.5f) / a, ny = (y - H * 0.5f) / b;
                float v = Mathf.Sqrt(nx * nx + ny * ny);
                float al = Mathf.Abs(v - 0.985f) < 0.012f ? 0.30f : 0f;
                tex.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, al));
            }
        tex.Apply();
        _ellipseTex[0] = tex;
        return tex;
    }

    static Texture2D[] _orbitLines;
    static Texture2D OrbitLine(int idx)
    {
        if (_orbitLines == null) _orbitLines = new Texture2D[3];
        if (_orbitLines[idx] != null) return _orbitLines[idx];
        const int W = 1024, H = 256;
        float[] alpha = { 0.16f, 0.22f, 0.28f };
        float[] thick = { 0.006f, 0.009f, 0.013f };
        var tex = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        float a = W * 0.5f, b = H * 0.5f;
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                float nx = (x - W * 0.5f) / a, ny = (y - H * 0.5f) / b;
                float v = Mathf.Sqrt(nx * nx + ny * ny);
                float al = Mathf.Abs(v - 1f) < thick[idx] ? alpha[idx] : 0f;
                tex.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, al));
            }
        tex.Apply();
        _orbitLines[idx] = tex;
        return tex;
    }

    static Texture2D Disc()
    {
        if (_disc != null) return _disc;
        const int S = 256;
        _disc = new Texture2D(S, S, TextureFormat.RGBA32, false);
        float c = S * 0.5f;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float dx = x - c, dy = y - c;
                float r = Mathf.Sqrt(dx * dx + dy * dy) / c;
                _disc.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, r < 0.95f ? 0.92f : 0f));
            }
        _disc.Apply();
        return _disc;
    }

    static Texture2D Ring()
    {
        if (_ring != null) return _ring;
        const int S = 256;
        _ring = new Texture2D(S, S, TextureFormat.RGBA32, false);
        float c = S * 0.5f;
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float dx = x - c, dy = y - c;
                float r = Mathf.Sqrt(dx * dx + dy * dy);
                float a = 0f;
                if (Mathf.Abs(r - c * 0.92f) < 1.2f) a = 0.8f;
                if (Mathf.Abs(r - c * 0.64f) < 0.9f) a = 0.35f;
                _ring.SetPixel(x, y, new Color(Ink.r, Ink.g, Ink.b, a));
            }
        _ring.Apply();
        return _ring;
    }
}
