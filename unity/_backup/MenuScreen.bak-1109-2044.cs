using System.Collections.Generic;
using UnityEngine;

namespace Yueliangxiang
{
    /// <summary>
    /// 开始界面：星空 + 行星，鼠标拖拽转视角。
    /// 流程照 docs/play-flow.md：主菜单 → 选星球 → 白模过场 CG → 进游戏。
    /// </summary>
    public class MenuScreen : MonoBehaviour
    {
        enum Phase { Menu, Pick, City, Info, Slots }

        string infoTitle = "";
        string infoBody = "";
        static bool soundOn = true;
        static AudioSource sfx;

        static MenuScreen _instance;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void BootMenu()
        {
            // 编辑器在后台也要继续跑帧，否则无焦点验收时截图永远不刷新
            UnityEngine.Application.runInBackground = true;
            if (_instance != null) return;
            var go = new GameObject("[月壤箱·开始界面]");
            Object.DontDestroyOnLoad(go);
            _instance = go.AddComponent<MenuScreen>();
        }

        readonly System.Collections.Generic.List<Transform> halos = new System.Collections.Generic.List<Transform>();

        class World
        {
            public string name, industry, genre, intro;
            public Color tint;
            public float radius;
            public Vector3 pos;
            public Transform body; public Transform core; public Transform cluster; public float spin;
        }

        static readonly World[] Worlds =
        {
            new World
            {
                name = "完人之门", industry = "殡仪馆", genre = "发展类 · 经营 + 事件",
                intro = "你是殡仪馆的打工大学生。香烛、前台、葬礼主持，一步步往上接。",
                tint = new Color(0.66f, 0.62f, 0.56f), radius = 9.6f
            },
            new World
            {
                name = "旧纸行星", industry = "旧书店", genre = "收集线索类",
                intro = "失业之后继承了一家旧书店。书里夹着的东西比书值钱。",
                tint = new Color(0.52f, 0.42f, 0.32f), radius = 9.6f
            },
            new World
            {
                name = "霓虹桌", industry = "赌场", genre = "社交攻略类",
                intro = "替人看牌桌的夜里，认识了理型。",
                tint = new Color(0.36f, 0.30f, 0.52f), radius = 9.6f
            },
            new World
            {
                name = "白塔区", industry = "大学", genre = "发展类 · 学术",
                intro = "走廊尽头那间旧档室，锁了三十年。",
                tint = new Color(0.58f, 0.60f, 0.64f), radius = 9.6f
            },
            new World
            {
                name = "灰烬环", industry = "焚化炉", genre = "收集线索类 · 悬疑",
                intro = "炉子后面那堵墙，比台账上记的多烧过一个人。",
                tint = new Color(0.62f, 0.44f, 0.36f), radius = 9.6f
            },
        };

        Phase phase = Phase.Menu;
        Camera cam;
        Transform rig;
        ParticleSystem stars;
        int hoveredWorld = -1;
        int menuIndex;
        bool _autoMenu, _autoPick;
        int selectedWorld = -1;

        float yaw, pitch = 8f;
        float dist = 92f;
        float targetDist = 92f;
        float spool; static float _dbgT;                 // 环带自转角
        float dragYaw;

        // 过场
        float phaseTime;
        GameObject city;
        readonly System.Collections.Generic.List<Transform> spiners = new System.Collections.Generic.List<Transform>();
        readonly System.Collections.Generic.List<float> spinSpeeds = new System.Collections.Generic.List<float>();
        List<Transform> cityBlocks = new List<Transform>();

        void Awake()
        {
            if (System.IO.File.Exists(Application.dataPath + "/.pickdemo")) phase = Phase.Pick;
            if (System.IO.File.Exists(Application.dataPath + "/.slotdemo")) phase = Phase.Slots;
            BuildCamera();
            BuildStars();
            // 三渲二走纯黑底：不铺星云、不铺尘带
            // 场景服从界面：天体改由 MenuGfx 以平面构成绘制，3D 先关掉
            // BuildWorlds();
            ApplyLook();
        }

        void BuildCamera()
        {
            cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.035f, 0.032f, 0.05f);
            cam.fieldOfView = 55f;
            cam.nearClipPlane = 0.1f;
            cam.backgroundColor = Color.black;
            cam.farClipPlane = 900f;

            rig = new GameObject("Rig").transform;
        }

        static Texture2D StarDot(int S)
        {
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = (x - S * 0.5f) / (S * 0.5f), dy = (y - S * 0.5f) / (S * 0.5f);
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    // 硬边圆点：三渲二里星星是"画上去的点"，不是发光团
                    float a = d < 0.55f ? 1f : (d < 0.72f ? 0.35f : 0f);
                    px[y * S + x] = new Color(1f, 0.98f, 0.92f, a);
                }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }

        static Texture2D SparkTex()
        {
            const int S = 128;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = Mathf.Abs(x - S * 0.5f) / (S * 0.5f);
                    float dy = Mathf.Abs(y - S * 0.5f) / (S * 0.5f);
                    float arm = (dx < 0.055f ? 1f - dy : 0f) + (dy < 0.055f ? 1f - dx : 0f);
                    float core = Mathf.Clamp01(1f - Mathf.Sqrt(dx * dx + dy * dy) * 6f);
                    float a = Mathf.Clamp01(arm + core);
                    px[y * S + x] = new Color(1f, 0.97f, 0.92f, a);
                }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }

        void BuildStars()
        {
            var go = new GameObject("Stars");
            go.transform.SetParent(rig, false);
            stars = go.AddComponent<ParticleSystem>();

            var main = stars.main;
            main.startLifetime = 9999f;
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.06f, 0.26f);
            main.maxParticles = 4000;
            main.simulationSpace = ParticleSystemSimulationSpace.Local;

            var emission = stars.emission;
            emission.enabled = false;

            var shape = stars.shape;
            shape.enabled = true;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 260f;
            shape.radiusThickness = 1f;

            var col = stars.colorOverLifetime;
            col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(
                new[] { new GradientColorKey(new Color(0.85f, 0.88f, 1f), 0f), new GradientColorKey(new Color(1f, 0.95f, 0.86f), 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 1f) });
            col.color = grad;

            stars.Emit(1400);
            var renderer = go.GetComponent<ParticleSystemRenderer>();
            renderer.renderMode = ParticleSystemRenderMode.Billboard;
            renderer.material = new Material(Shader.Find("Unlit/Transparent")) { mainTexture = StarDot(64), renderQueue = 1002 };
            main.startSize = new ParticleSystem.MinMaxCurve(0.10f, 0.34f);

            // 几颗十字星光，跟三渲二的黑白硬边同一路人
            var rnd = new System.Random(20261108);
            for (int i = 0; i < 14; i++)
            {
                var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
                q.name = "spark";
                q.transform.SetParent(go.transform, false);
                float rr = 210f + (float)rnd.NextDouble() * 70f;
                float th = (float)rnd.NextDouble() * Mathf.PI * 2f;
                float ph = Mathf.Acos(2f * (float)rnd.NextDouble() - 1f);
                q.transform.localPosition = new Vector3(Mathf.Sin(ph) * Mathf.Cos(th) * rr, Mathf.Cos(ph) * rr, Mathf.Sin(ph) * Mathf.Sin(th) * rr);
                q.transform.localScale = Vector3.one * (5.5f + (float)rnd.NextDouble() * 5f);
                q.transform.LookAt(rig);
                q.transform.Rotate(0f, 0f, (float)rnd.NextDouble() * 90f);
                q.GetComponent<MeshRenderer>().material = new Material(Shader.Find("Unlit/Transparent")) { mainTexture = SparkTex(), renderQueue = 1003 };
                Object.Destroy(q.GetComponent<Collider>());
                spiners.Add(q.transform);
                spinSpeeds.Add(0.6f + (float)rnd.NextDouble());
            }

            // 远层尘埃：更密更小更暗，把黑底填成"亿万点"，星球才不会像贴上去
            var dustGo = new GameObject("Dust");
            dustGo.transform.SetParent(rig, false);
            var dust = dustGo.AddComponent<ParticleSystem>();
            var dm = dust.main;
            dm.startLifetime = 9999f;
            dm.startSpeed = 0f;
            dm.startSize = new ParticleSystem.MinMaxCurve(0.05f, 0.16f);
            dm.maxParticles = 9000;
            dm.simulationSpace = ParticleSystemSimulationSpace.Local;
            var de = dust.emission; de.enabled = false;
            var ds = dust.shape; ds.enabled = true;
            ds.shapeType = ParticleSystemShapeType.Sphere;
            ds.radius = 420f; ds.radiusThickness = 1f;
            var dcol = dust.colorOverLifetime; dcol.enabled = true;
            var dg = new Gradient();
            dg.SetKeys(
                new[] { new GradientColorKey(new Color(0.72f, 0.76f, 0.95f), 0f), new GradientColorKey(new Color(0.95f, 0.88f, 0.80f), 1f) },
                new[] { new GradientAlphaKey(0.55f, 0f), new GradientAlphaKey(0.55f, 1f) });
            dcol.color = dg;
            dust.Emit(8000);
            var dr = dustGo.GetComponent<ParticleSystemRenderer>();
            dr.renderMode = ParticleSystemRenderMode.Billboard;
            dr.material = MakeMaterial(new Color(0.62f, 0.66f, 0.88f), 1.1f);
        }

        Material MakeMaterial(Color c, float emission)
        {
            var shader = Shader.Find("Unlit/Color");
            var m = new Material(shader);
            m.color = c;
            return m;
        }

        static float Hash(int x, int y, int seed)
        {
            int h = x * 374761393 + y * 668265263 + seed * 1442695040;
            h = (h ^ (h >> 13)) * 1274126177;
            return ((h ^ (h >> 16)) & 0x7fffffff) / 2147483647f;
        }

        static float ValueNoise(float x, float y, int seed)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float xf = x - xi, yf = y - yi;
            float u = xf * xf * (3f - 2f * xf), v = yf * yf * (3f - 2f * yf);
            float a = Hash(xi, yi, seed), b = Hash(xi + 1, yi, seed);
            float c = Hash(xi, yi + 1, seed), d = Hash(xi + 1, yi + 1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, u), Mathf.Lerp(c, d, u), v);
        }

        static float Fbm(float x, float y, int seed)
        {
            float sum = 0f, amp = 0.5f, f = 1f;
            for (int i = 0; i < 4; i++)
            {
                sum += ValueNoise(x * f, y * f, seed + i * 37) * amp;
                amp *= 0.5f; f *= 2.05f;
            }
            return sum;
        }

        // 按 NASA 照片的路子：纬度云带 + 湍流 + 极区变亮，而不是均匀横条
        static Material MakePlanet(Color tint, int seed, float bandFreq)
        {
            const int W = 512, H = 256;
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
            tex.wrapModeU = TextureWrapMode.Repeat;
            tex.wrapModeV = TextureWrapMode.Clamp;
            var px = new Color32[W * H];
            var rnd = new System.Random(seed);
            float shift = (float)rnd.NextDouble() * 10f;

            Color dark = Color.Lerp(tint, Color.black, 0.42f);
            Color mid = tint;
            Color light = Color.Lerp(tint, Color.white, 0.72f);

            for (int y = 0; y < H; y++)
            {
                float v = y / (float)(H - 1);
                float lat = Mathf.Abs(v - 0.5f) * 2f;                 // 0 赤道 1 极
                // 主云带：慢波 + 快波叠出宽窄不一的条带
                float band = Mathf.Sin((v * bandFreq + shift) * Mathf.PI * 2f) * 0.6f
                           + Mathf.Sin((v * bandFreq * 3.3f + shift * 0.7f) * Mathf.PI * 2f) * 0.25f;
                band = band * 0.5f + 0.5f;

                for (int x = 0; x < W; x++)
                {
                    float u = x / (float)W;
                    // 湍流：横向拉伸的噪声，模拟云被自转拉长
                    float n = Fbm(u * 26f, v * 52f, seed);
                    float swirl = Fbm(u * 9f + n * 1.7f, v * 16f + n * 0.8f, seed + 11);
                    float k = Mathf.Clamp01(band * 0.55f + swirl * 0.35f + n * 0.25f);
                    // 极区提亮、赤道略暗
                    k = Mathf.Clamp01(k + Mathf.SmoothStep(0f, 0.22f, lat * lat));
                    Color c = k < 0.5f
                        ? Color.Lerp(dark, mid, k * 2f)
                        : Color.Lerp(mid, light, (k - 0.5f) * 2f);
                    // 细碎斑块
                    float speck = Fbm(u * 90f, v * 90f, seed + 71);
                    c = Color.Lerp(c, c * 0.86f, Mathf.SmoothStep(0.55f, 0.85f, speck) * 0.5f);
                    px[y * W + x] = c;
                }
            }
            tex.SetPixels32(px);
            tex.Apply();

            var shader = Shader.Find("Moonlight/Planet");
            if (shader == null) shader = Shader.Find("Standard");
            var m = new Material(shader) { mainTexture = tex };
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.05f);
            // 大气边缘光：取行星本色的高亮版本，偏冷
            var atm = Color.Lerp(tint, Color.white, 0.55f);
            atm = Color.Lerp(atm, new Color(0.72f, 0.84f, 1f), 0.35f);
            if (m.HasProperty("_RimColor")) m.SetColor("_RimColor", atm);
            if (m.HasProperty("_RimPower")) m.SetFloat("_RimPower", 4.2f + (seed % 5) * 0.2f);
            if (m.HasProperty("_RimStrength")) m.SetFloat("_RimStrength", 0.5f);
            return m;
        }

        static Material MakeSmall(Color tint, int seed)
        {
            var tex = new Texture2D(32, 32, TextureFormat.RGBA32, false);
            var rnd = new System.Random(seed);
            var px = new Color32[32 * 32];
            for (int i = 0; i < px.Length; i++)
            {
                float k = 0.75f + (float)rnd.NextDouble() * 0.35f;
                px[i] = new Color(tint.r * k, tint.g * k, tint.b * k, 1f);
            }
            tex.SetPixels32(px); tex.Apply();
            var m = new Material(Shader.Find("Standard")) { mainTexture = tex };
            m.SetFloat("_Glossiness", 0.05f);
            return m;
        }


        // 一层淡淡的星云，压在最远处，给黑底一点层次（NASA 照片里背景从不纯黑）
        static Texture2D MakeNebula(int seed, Color a, Color b)
        {
            const int S = 256;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float u = x / (float)S, v = y / (float)S;
                    float n = Fbm(u * 3.2f, v * 3.2f, seed);
                    float n2 = Fbm(u * 7.5f + n * 2f, v * 7.5f - n * 1.4f, seed + 9);
                    float k = Mathf.Clamp01(n * 0.7f + n2 * 0.5f - 0.28f);
                    // 中心亮、边缘散开
                    float r = Vector2.Distance(new Vector2(u, v), new Vector2(0.5f, 0.5f)) * 2f;
                    k *= Mathf.Clamp01(1.15f - r);
                    k = Mathf.Pow(k, 1.35f);
                    Color c = Color.Lerp(a, b, Mathf.Clamp01(n2 * 1.4f));
                    px[y * S + x] = new Color(c.r, c.g, c.b, k * 1.45f);
                }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }

        static Texture2D MakeHalo(int S)
        {
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = (x - S * 0.5f) / (S * 0.5f);
                    float dy = (y - S * 0.5f) / (S * 0.5f);
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = Mathf.Clamp01(1f - d);
                    a = Mathf.Pow(a, 2.6f) * 0.9f;
                    px[y * S + x] = new Color(1f, 1f, 1f, a);
                }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }

        Sprite _halo;
        Sprite Halo()
        {
            if (_halo == null)
            {
                var t = MakeHalo(128);
                _halo = Sprite.Create(t, new Rect(0, 0, 128, 128), new Vector2(0.5f, 0.5f));
            }
            return _halo;
        }

        void BuildNebula()
        {
            var go = new GameObject("nebula");
            go.transform.SetParent(rig, false);
            go.transform.localPosition = new Vector3(0f, 0f, 300f);
            go.transform.localRotation = Quaternion.Euler(0f, 0f, 18f);
            go.transform.localScale = new Vector3(1400f, 900f, 1f);
            var sr = go.AddComponent<SpriteRenderer>();
            var t = MakeNebula(7, new Color(0.16f, 0.28f, 0.52f), new Color(0.55f, 0.30f, 0.42f));
            sr.sprite = Sprite.Create(t, new Rect(0, 0, 256, 256), new Vector2(0.5f, 0.5f));
            sr.material = new Material(Shader.Find("Sprites/Default")) { renderQueue = 1000 };
            sr.sortingOrder = -100;
            sr.color = new Color(1f, 1f, 1f, 0.35f);

            var go2 = new GameObject("nebula2");
            go2.transform.SetParent(rig, false);
            go2.transform.localPosition = new Vector3(220f, -120f, 320f);
            go2.transform.localScale = new Vector3(900f, 700f, 1f);
            var sr2 = go2.AddComponent<SpriteRenderer>();
            var t2 = MakeNebula(23, new Color(0.42f, 0.22f, 0.30f), new Color(0.20f, 0.34f, 0.46f));
            sr2.sprite = Sprite.Create(t2, new Rect(0, 0, 256, 256), new Vector2(0.5f, 0.5f));
            sr2.material = new Material(Shader.Find("Sprites/Default")) { renderQueue = 1001 };
            sr2.sortingOrder = -99;
            sr2.color = new Color(1f, 1f, 1f, 0.28f);
        }


        readonly System.Collections.Generic.List<Transform> fogBands = new System.Collections.Generic.List<Transform>();

        void BuildFogBands()
        {
            // 几条极淡的横向尘带：把星球的边吃掉，让它们像长在雾里，而不是贴在黑板上
            for (int i = 0; i < 3; i++)
            {
                var go = new GameObject("fog" + i);
                go.transform.SetParent(rig, false);
                go.transform.localPosition = new Vector3((i - 1) * 90f, -30f + i * 26f, 210f + i * 26f);
                go.transform.localRotation = Quaternion.Euler(0f, 0f, (i - 1) * 5f);
                go.transform.localScale = new Vector3(1150f, 360f + i * 60f, 1f);
                var sr = go.AddComponent<SpriteRenderer>();
                var t = MakeNebula(40 + i * 7, new Color(0.30f, 0.34f, 0.52f), new Color(0.52f, 0.40f, 0.52f));
                sr.sprite = Sprite.Create(t, new Rect(0, 0, 256, 256), new Vector2(0.5f, 0.5f));
                sr.material = new Material(Shader.Find("Sprites/Default")) { renderQueue = 1005 };
                sr.sortingOrder = -98 + i;
                sr.color = new Color(1f, 1f, 1f, 0.35f);
                fogBands.Add(go.transform);
            }
        }

        // 把球面光照、边缘变暗、大气辉光（以及带环那颗的环）烘进一张 RGBA 贴图
        static Texture2D MakePlanetSprite(Color tint, int seed, float bandFreq, int S, bool ring)
        {
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[S * S];
            var rnd = new System.Random(seed);
            float shift = (float)rnd.NextDouble() * 10f;
            Color dark = Color.Lerp(tint, Color.black, 0.55f);
            Color mid = tint;
            Color light = Color.Lerp(tint, Color.white, 0.55f);
            Vector3 L = new Vector3(-0.55f, 0.32f, 0.77f).normalized;
            Color atmo = Color.Lerp(Color.Lerp(tint, Color.white, 0.6f), new Color(0.55f, 0.75f, 1f), 0.45f);

            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float u = (x + 0.5f) / S * 2f - 1f;
                    float v = (y + 0.5f) / S * 2f - 1f;
                    float r = Mathf.Sqrt(u * u + v * v);

                    if (r <= 1f)
                    {
                        float nz = Mathf.Sqrt(Mathf.Max(0f, 1f - r * r));
                        Vector3 n = new Vector3(u, v, nz);
                        float lat = v;                                   // -1..1
                        float band = Mathf.Sin((lat * bandFreq + shift) * Mathf.PI) * 0.5f + 0.5f;
                        float turb = Fbm((u * 2.2f + 3f) * 2.4f, (lat * 2.2f + 3f) * 4.4f, seed) * 0.7f
                                   + Fbm((u + 5f) * 9f, (lat + 5f) * 16f, seed + 21) * 0.4f;
                        float k = Mathf.Clamp01(band * 0.55f + turb * 0.55f);
                        k = Mathf.Clamp01(k + Mathf.SmoothStep(0f, 0.18f, Mathf.Abs(lat) * Mathf.Abs(lat)));
                        Color albedo = k < 0.5f ? Color.Lerp(dark, mid, k * 2f) : Color.Lerp(mid, light, (k - 0.5f) * 2f);

                        float diff = Mathf.Clamp01(Vector3.Dot(n, L));
                        float limb = Mathf.Pow(nz, 0.42f);               // 边缘变暗
                        float rim = Mathf.Pow(1f - nz, 3.2f) * 0.9f;      // 大气边缘
                        Color c = albedo * (0.06f + 1.02f * diff) * limb;
                        c += atmo * rim;

                        // 环：倾斜椭圆，半透明，带一点明暗
                        if (ring)
                        {
                            float ry = (v + u * 0.36f) / 0.22f;           // 倾斜
                            float rr = Mathf.Sqrt(u * u * 1.0f + ry * ry * 1.0f);
                            if (rr > 1.02f && rr < 1.55f && Mathf.Abs(ry) < 1.2f)
                            {
                                float bandAlpha = 0.30f + 0.25f * Mathf.Sin(rr * 34f);
                                float lit = 0.55f + 0.45f * Mathf.Clamp01(Vector3.Dot(new Vector3(u, v, 0f).normalized, new Vector3(L.x, L.y, 0f).normalized));
                                Color rc = Color.Lerp(tint, Color.white, 0.55f) * lit;
                                float a = bandAlpha * Mathf.Clamp01(1f - Mathf.Abs(rr - 1.28f) / 0.28f);
                                float d = a * (1f - Mathf.Clamp01((r - 1f) * 6f) * 0.0f);
                                c = Color.Lerp(c, rc, Mathf.Clamp01(d * 1.6f));
                            }
                        }

                        float alpha = Mathf.Clamp01((1f - r) * 24f);
                        px[y * S + x] = new Color(c.r, c.g, c.b, alpha);
                    }
                    else
                    {
                        // 外圈薄雾
                        float g = Mathf.Exp(-(r - 1f) * 7.5f) * 0.5f;
                        px[y * S + x] = new Color(atmo.r, atmo.g, atmo.b, g);
                    }
                }
            tex.SetPixels32(px); tex.Apply();
            return tex;
        }

        void EnsureKeyLight()
        {
            // 环境光压到极低，让明暗交界真正出现（城市过场会把环境光调亮，这里要抢回来）
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.12f, 0.11f, 0.17f);
            if (rig.Find("planet-light") != null) return;
            var go = new GameObject("planet-light");
            go.transform.SetParent(rig, false);
            var l = go.AddComponent<Light>();
            l.type = LightType.Directional;
            l.intensity = 1.25f;
            l.color = new Color(1f, 0.97f, 0.92f);
            go.transform.rotation = Quaternion.Euler(28f, -35f, 0f);
        }

        LineRenderer orbitLine;
        float _orbitRing; Quaternion _orbitTilt;

        void DrawOrbitLine(float ring, Quaternion tilt)
        {
            if (orbitLine != null) Destroy(orbitLine.gameObject);
            var go = new GameObject("orbit");
            go.transform.SetParent(rig, false);
            orbitLine = go.AddComponent<LineRenderer>();
            orbitLine.useWorldSpace = false;
            orbitLine.loop = true;
            orbitLine.widthMultiplier = 0.35f;
            orbitLine.positionCount = 220;
            var mat = new Material(Shader.Find("Sprites/Default"));
            mat.color = new Color(0.82f, 0.80f, 0.74f, 0.16f);
            orbitLine.material = mat;
            orbitLine.startColor = new Color(0.82f, 0.80f, 0.74f, 0.16f);
            orbitLine.endColor = new Color(0.82f, 0.80f, 0.74f, 0.16f);
            for (int i = 0; i < 220; i++)
            {
                float a = i / 220f * Mathf.PI * 2f;
                orbitLine.SetPosition(i, tilt * new Vector3(Mathf.Cos(a) * ring, 0f, Mathf.Sin(a) * ring));
            }
        }

        static Material ToonMat(Color tint, float bands)
        {
            var toon = Shader.Find("Yue/Toon");
            if (toon == null) return FlatMat(tint);
            var m = new Material(toon);
            m.SetColor("_Color", Color.Lerp(tint, Color.white, 0.78f));
            m.SetColor("_ShadeColor", Color.Lerp(tint, new Color(0.46f, 0.44f, 0.60f), 0.35f));
            m.SetColor("_RimColor", new Color(1f, 0.96f, 0.90f));
            m.SetFloat("_RimStrength", 0.30f);
            m.SetFloat("_Outline", 0.032f);
            m.SetFloat("_Steps", 2f);
            m.SetFloat("_Bands", bands);
            return m;
        }

        static Material FlatMat(Color c)
        {
            var m = new Material(Shader.Find("Standard"));
            m.color = c;
            m.SetFloat("_Glossiness", 0.28f);
            m.SetFloat("_Metallic", 0.05f);
            return m;
        }

        static Transform Prim(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Color c, Vector3 euler = default)
        {
            var go = GameObject.CreatePrimitive(t);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = Quaternion.Euler(euler);
            go.GetComponent<MeshRenderer>().material = FlatMat(c);
            Object.Destroy(go.GetComponent<Collider>());
            return go.transform;
        }

        static Mesh TorusMesh(float R, float r, int seg = 64, int side = 12)
        {
            var m = new Mesh();
            var verts = new System.Collections.Generic.List<Vector3>();
            var norms = new System.Collections.Generic.List<Vector3>();
            var tris = new System.Collections.Generic.List<int>();
            for (int i = 0; i <= seg; i++)
            {
                float u = i / (float)seg * Mathf.PI * 2f;
                for (int j = 0; j <= side; j++)
                {
                    float v = j / (float)side * Mathf.PI * 2f;
                    var n = new Vector3(Mathf.Cos(u) * Mathf.Cos(v), Mathf.Sin(v), Mathf.Sin(u) * Mathf.Cos(v));
                    verts.Add(new Vector3(Mathf.Cos(u) * (R + r * Mathf.Cos(v)), r * Mathf.Sin(v), Mathf.Sin(u) * (R + r * Mathf.Cos(v))));
                    norms.Add(n);
                }
            }
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < side; j++)
                {
                    int a = i * (side + 1) + j, b = a + side + 1;
                    tris.Add(a); tris.Add(b); tris.Add(a + 1);
                    tris.Add(a + 1); tris.Add(b); tris.Add(b + 1);
                }
            m.SetVertices(verts); m.SetNormals(norms); m.SetTriangles(tris, 0);
            return m;
        }

        static Transform Torus(Transform parent, Vector3 pos, float R, float r, Color c, Vector3 euler = default)
        {
            var go = new GameObject("torus");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(euler);
            go.AddComponent<MeshFilter>().sharedMesh = TorusMesh(R, r);
            go.AddComponent<MeshRenderer>().material = FlatMat(c);
            return go.transform;
        }

        // 世界观回到"杂物盒"：太空里漂的不是星球，是文具和零碎
        void BuildClutter()
        {
            string[] names = { "橡皮", "回形针", "削笔刀", "纽扣", "纸团" };
            for (int i = 0; i < names.Length; i++)
            {
                var w = Worlds[i];
                EnsureKeyLight();
                var holder = new GameObject("clutter:" + names[i]).transform;
                holder.SetParent(rig, false);
                w.body = holder;

                var pivot = new GameObject("pivot").transform;
                pivot.SetParent(holder, false);
                w.core = pivot;
                w.spin = 6f + i * 3.5f;

                switch (i)
                {
                    case 0: // 橡皮：扁长方体 + 一条浅色纸套
                        Prim(PrimitiveType.Cube, pivot, Vector3.zero, new Vector3(1.9f, 0.7f, 0.9f), new Color(0.86f, 0.80f, 0.74f));
                        Prim(PrimitiveType.Cube, pivot, new Vector3(0f, 0.02f, 0f), new Vector3(1.94f, 0.42f, 0.94f), new Color(0.36f, 0.52f, 0.72f));
                        break;
                    case 1: // 回形针：三个环拼出来的意思
                        Torus(pivot, Vector3.zero, 0.72f, 0.075f, new Color(0.80f, 0.82f, 0.86f), new Vector3(90f, 0f, 0f));
                        Torus(pivot, new Vector3(0.62f, 0f, 0f), 0.44f, 0.06f, new Color(0.88f, 0.89f, 0.92f), new Vector3(90f, 0f, 0f));
                        break;
                    case 2: // 削笔刀：方块 + 圆孔
                        Prim(PrimitiveType.Cube, pivot, Vector3.zero, new Vector3(1.6f, 0.8f, 1.0f), new Color(0.55f, 0.58f, 0.55f));
                        Prim(PrimitiveType.Cylinder, pivot, new Vector3(0.55f, 0.42f, 0f), new Vector3(0.5f, 0.04f, 0.5f), new Color(0.18f, 0.18f, 0.2f));
                        break;
                    case 3: // 纽扣
                        Prim(PrimitiveType.Cylinder, pivot, Vector3.zero, new Vector3(1.5f, 0.14f, 1.5f), new Color(0.72f, 0.44f, 0.36f));
                        Prim(PrimitiveType.Cylinder, pivot, new Vector3(0.24f, 0.1f, 0.28f), new Vector3(0.22f, 0.06f, 0.22f), new Color(0.16f, 0.12f, 0.11f));
                        Prim(PrimitiveType.Cylinder, pivot, new Vector3(-0.28f, 0.1f, 0.28f), new Vector3(0.22f, 0.06f, 0.22f), new Color(0.16f, 0.12f, 0.11f));
                        break;
                    case 4: // 纸团
                        var ball = Prim(PrimitiveType.Sphere, pivot, Vector3.zero, new Vector3(1.5f, 1.34f, 1.44f), new Color(0.92f, 0.90f, 0.84f));
                        var mesh = ball.GetComponent<MeshFilter>().sharedMesh;
                        var vs = mesh.vertices;
                        for (int k = 0; k < vs.Length; k++)
                        {
                            float n = Mathf.PerlinNoise(vs[k].x * 3.1f + 4f, vs[k].y * 3.1f + 9f);
                            vs[k] *= 0.86f + n * 0.28f;
                        }
                        mesh.vertices = vs;
                        mesh.RecalculateNormals();
                        break;
                }

                w.cluster = BuildCluster(i, w, holder);
            }
            LayoutWorlds();
        }

        void BuildWorlds()
        {
            for (int i = 0; i < Worlds.Length; i++)
            {
                var w = Worlds[i];
                EnsureKeyLight();
                var holder = new GameObject("world:" + w.name).transform;
                holder.SetParent(rig, false);
                w.body = holder;

                // 主星球：优先 Blender 导出的实体 GLB（Resources/Models/planet_i），
                // 其次烘好的立绘（Planets/planet_i），都没有才退回程序化
                Texture2D baked = Resources.Load<Texture2D>("Planets/planet_" + i);
                GameObject model = Resources.Load<GameObject>("Models/planet_" + i);
                if (model != null)
                {
                    var inst = Object.Instantiate(model, holder, false);
                    inst.name = "core3d";
                    inst.transform.localScale = Vector3.one * w.radius * 1.55f;
                    var toon = Shader.Find("Yue/Toon");
                    var rends = inst.GetComponentsInChildren<MeshRenderer>();
                    foreach (var rd in rends)
                    {
                        if (toon == null) break;
                        var m = new Material(toon);
                        var baseCol = Color.Lerp(w.tint, Color.white, 0.78f);
                        m.SetColor("_Color", baseCol);
                        m.SetColor("_ShadeColor", Color.Lerp(w.tint, new Color(0.46f, 0.44f, 0.60f), 0.35f));
                        m.SetColor("_RimColor", new Color(1f, 0.96f, 0.90f));
                        m.SetFloat("_RimStrength", 0.42f);
                        m.SetFloat("_Outline", 0.032f);
                        m.SetFloat("_Bands", 5f + i);
                        m.SetFloat("_Steps", 2f);
                        rd.material = m;
                    }
                    w.core = inst.transform;
                    w.spin = 12f + i * 6f;
                }
                else
                {
                    var tex = baked != null ? baked : MakePlanetSprite(w.tint, 100 + i, 2.2f + i * 0.6f, 512, i == 2);
                    var quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
                    quad.name = "core";
                    quad.transform.SetParent(holder, false);
                    quad.transform.localScale = Vector3.one * w.radius * 2.9f;
                    var mat = new Material(Shader.Find("Unlit/Transparent")) { mainTexture = tex };
                    mat.mainTextureScale = Vector2.one;
                    quad.GetComponent<MeshRenderer>().material = mat;
                    Object.Destroy(quad.GetComponent<Collider>());
                    w.core = quad.transform;
                    w.spin = 0.012f + i * 0.004f;
                }

                if (i == 2 && baked == null && model == null)
                {
                    var ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    ring.name = "ring";
                    ring.transform.SetParent(holder, false);
                    ring.transform.localScale = new Vector3(w.radius * 2.15f, 0.005f, w.radius * 2.15f);
                    ring.transform.localRotation = Quaternion.Euler(16f, 0f, 12f);
                    ring.GetComponent<MeshRenderer>().material = MakeMaterial(new Color(0.86f, 0.80f, 0.68f), 0f);
                    Object.Destroy(ring.GetComponent<Collider>());
                }

                var halo = GameObject.CreatePrimitive(PrimitiveType.Quad);
                halo.name = "glow";
                halo.transform.SetParent(holder, false);
                halo.transform.localPosition = new Vector3(0f, 0f, 1.2f);
                halo.transform.localScale = Vector3.one * w.radius * 9.2f;
                var htex = MakeHalo(256);
                var hmat = new Material(Shader.Find("Unlit/Transparent")) { mainTexture = htex, renderQueue = 2999 };
                var hcol = Color.Lerp(w.tint, Color.white, 0.55f);
                hmat.SetColor("_Color", new Color(hcol.r, hcol.g, hcol.b, 0.13f));
                halo.GetComponent<MeshRenderer>().material = hmat;
                Object.Destroy(halo.GetComponent<Collider>());
                halos.Add(halo.transform);
                halo.SetActive(false);

                w.cluster = BuildCluster(i, w, holder);
            }
            LayoutWorlds();
        }

        Transform BuildCluster(int idx, World w, Transform holder)
        {
            var root = new GameObject("cluster").transform;
            root.SetParent(holder, false);

            Color bright = Color.Lerp(w.tint, Color.white, 0.55f);
            Color dim = Color.Lerp(w.tint, Color.white, 0.28f);
            var matBright = MakeMaterial(bright, 0f);
            var matDim = MakeMaterial(dim, 0f);
            float R = w.radius;
            var rnd = new System.Random(7000 + idx * 31);

            // 同一宇宙里的多个「星系」：几颗体积相近的球，彼此拉开距离，谁也不拱卫谁
            int n = 6 + idx % 4;                       // 6–9 颗，别挤成一团
            float d = R * (3.4f + idx * 0.25f);        // 间距放大
            for (int k = 0; k < n; k++)
            {
                float a = k / (float)n * Mathf.PI * 2f + idx * 0.7f;
                float size = R * (0.34f + (float)rnd.NextDouble() * 0.52f);  // 0.30–0.92 R：有大小差，但不分主次
                var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                go.name = "sib";
                go.transform.SetParent(root, false);
                go.transform.localScale = Vector3.one * size * 2f;
                var moonTint = Color.Lerp(w.tint, k % 2 == 0 ? Color.white : Color.gray, k % 2 == 0 ? 0.45f : 0.15f);
                go.GetComponent<MeshRenderer>().material = ToonMat(moonTint, 3f + (k % 3));
                Object.Destroy(go.GetComponent<Collider>());
                float jr = d * (0.85f + (float)rnd.NextDouble() * 0.4f);
                go.transform.localPosition = new Vector3(
                    Mathf.Cos(a) * jr,
                    Mathf.Sin(a * 1.6f) * R * 0.9f,
                    Mathf.Sin(a) * jr);

                // 有一颗带环，且环径只比自身略大
                if (k == 1)
                {
                    var ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    ring.name = "ring";
                    ring.transform.SetParent(root, false);
                    ring.transform.position = go.transform.position;
                    ring.transform.localScale = new Vector3(size * 2.6f, 0.01f, size * 2.6f);
                    ring.transform.localRotation = Quaternion.Euler(18f, 0f, 10f);
                    ring.GetComponent<MeshRenderer>().material = ToonMat(Color.Lerp(w.tint, Color.white, 0.55f), 0f);
                    Object.Destroy(ring.GetComponent<Collider>());
                }
            }
            // 碎屑云：细密小石块，围着整团慢慢转
            for (int k = 0; k < 60; k++)
            {
                float a = (float)rnd.NextDouble() * Mathf.PI * 2f;
                float rr = d * (0.35f + (float)rnd.NextDouble() * 1.05f);
                var sp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                sp.name = "dust";
                sp.transform.SetParent(root, false);
                sp.transform.localScale = Vector3.one * R * (0.05f + (float)rnd.NextDouble() * 0.10f) * 2f;
                sp.GetComponent<MeshRenderer>().material = ToonMat(Color.Lerp(w.tint, Color.white, 0.35f), 0f);
                Object.Destroy(sp.GetComponent<Collider>());
                sp.transform.localPosition = new Vector3(Mathf.Cos(a) * rr, ((float)rnd.NextDouble() - 0.5f) * R * 1.2f, Mathf.Sin(a) * rr);
                spiners.Add(sp.transform);
                spinSpeeds.Add(1.2f + (float)rnd.NextDouble() * 4f);
            }
            return root;
        }

        void LayoutWorlds()
        {
            // 轨道面斜置：左上 → 右下，贯穿整屏
            float ring = 128f;
            var tilt = Quaternion.Euler(18f, 0f, -32f);
            if (!Mathf.Approximately(_orbitRing, ring)) { _orbitRing = ring; _orbitTilt = tilt; DrawOrbitLine(ring, tilt); }
            for (int i = 0; i < Worlds.Length; i++)
            {
                float a = (i / (float)Worlds.Length) * Mathf.PI * 2f + spool;
                var w = Worlds[i];
                var p = new Vector3(Mathf.Sin(a) * ring, 0f, Mathf.Cos(a) * ring);
                p = tilt * p;
                p.y += Mathf.Sin(a * 1.7f) * 2.4f;
                // 整条星带右移，把左侧留给标题与菜单
                p.x += 24f;
                p.y += 2f;
                w.pos = p;
                if (w.body != null) w.body.localPosition = p;
            }
        }

        void ApplyLook()
        {
            rig.localRotation = Quaternion.Euler(pitch, yaw, 0f);
            if (phase == Phase.City)
            {
                var want = new Vector3(0f, 78f, -126f);
                cam.transform.position = Vector3.Lerp(cam.transform.position, want, Time.deltaTime * 1.8f);
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(new Vector3(0f, 2f, 4f) - cam.transform.position), Time.deltaTime * 1.8f);
            }
            else
            {
                cam.transform.rotation = Quaternion.identity;
                cam.transform.position = new Vector3(0f, 2f, -dist);
            }
            cam.transform.rotation = Quaternion.identity;
            cam.transform.SetParent(null, true);
            if (phase == Phase.City)
            {
                var want = new Vector3(0f, 78f, -126f);
                cam.transform.position = Vector3.Lerp(cam.transform.position, want, Time.deltaTime * 1.8f);
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(new Vector3(0f, 2f, 4f) - cam.transform.position), Time.deltaTime * 1.8f);
            }
            else
            {
                cam.transform.rotation = Quaternion.identity;
                cam.transform.position = new Vector3(0f, 2f, -dist);
            }
        }

        int _dragId = -1;
        Vector2 _dragLast;
        bool _dragMoved;

        void DragUpdate()
        {
            if (phase != Phase.Menu && phase != Phase.Pick) return;
            var m = new Vector2(Input.mousePosition.x, Screen.height - Input.mousePosition.y);
            if (Input.GetMouseButtonDown(0))
            {
                _dragId = MenuGfx.Pick(m, Screen.width, Screen.height);
                _dragLast = m; _dragMoved = false;
            }
            else if (Input.GetMouseButton(0))
            {
                var d = m - _dragLast;
                if (d.sqrMagnitude > 0.4f) _dragMoved = true;
                if (_dragId >= 0) MenuGfx.Spin[_dragId] += d.x * 0.5f;   // 拖星球：只转这一颗
                else MenuGfx.ViewAngle += d.x * 0.12f;                    // 拖空白：整幅星空一起转
                _dragLast = m;
            }
            else if (Input.GetMouseButtonUp(0))
            {
                if (!_dragMoved)
                {
                    // 主菜单里点星球只做高亮，绝不直接开局；
                    // 真正选星球、进白模，必须走「新游戏 → 选星球」这条线。
                    if (phase == Phase.Pick)
                    {
                        if (_dragId >= 0)
                        {
                            if (MenuGfx.Selected == _dragId)
                            {
                                selectedWorld = _dragId;
                                phase = Phase.City; phaseTime = 0f;
                                StartCoroutine(SelectRoutine());
                            }
                            else MenuGfx.Selected = _dragId;
                        }
                        else MenuGfx.Selected = -1;
                    }
                    else if (_dragId >= 0) MenuGfx.Selected = _dragId;
                    else MenuGfx.Selected = -1;
                }
                _dragId = -1;
            }
        }

        void Update()
        {
            DragUpdate();
            phaseTime += Time.deltaTime;

            // 鼠标拖动转视角
            if (Input.GetMouseButton(0) || Input.GetMouseButton(1))
            {
                float dx = Input.GetAxis("Mouse X") * 3.2f;
                float dy = Input.GetAxis("Mouse Y") * 2.2f;
                if (phase == Phase.Menu) { yaw += dx; pitch = Mathf.Clamp(pitch - dy, -35f, 45f); }
                else { yaw += dx * 0.6f; }
                dragYaw += dx * 0.4f;
            }

            if (phase == Phase.Menu) spool += Time.deltaTime * 0.055f;
            for (int i = 0; i < Worlds.Length; i++)
            {
                if (Worlds[i].core != null)
                    Worlds[i].core.Rotate(Vector3.up, Worlds[i].spin * Time.deltaTime, Space.Self);
                if (Worlds[i].cluster != null)
                    Worlds[i].cluster.Rotate(Vector3.up, (1.6f + i * 0.7f) * Time.deltaTime, Space.Self);
            }
            for (int i = 0; i < fogBands.Count; i++)
            {
                if (fogBands[i] == null) continue;
                var p2 = fogBands[i].localPosition;
                p2.x = Mathf.Sin(Time.time * 0.03f + i) * 60f + (i - 1) * 80f;
                fogBands[i].localPosition = p2;
            }
            for (int i = 0; i < halos.Count; i++)
            {
                if (halos[i] != null && cam != null)
                    halos[i].rotation = cam.transform.rotation;
            }
            for (int i = 0; i < spiners.Count; i++)
            {
                if (spiners[i] != null) spiners[i].Rotate(Vector3.up, spinSpeeds[i] * Time.deltaTime, Space.Self);
            }
            if (phase != Phase.City) LayoutWorlds();

            // 相机距离：选星球时往前推
            // 正交投影：所有星球远近一致，看起来才像同一个星系群
            bool ortho = phase == Phase.Menu || phase == Phase.Pick;
            targetDist = phase == Phase.Menu ? 86f : phase == Phase.Pick ? 70f : 12f;
            dist = Mathf.Lerp(dist, targetDist, Time.deltaTime * 2.4f);
            if (cam.orthographic != ortho) cam.orthographic = ortho;
            if (ortho) cam.orthographicSize = dist;

            rig.localRotation = Quaternion.Euler(phase == Phase.Menu ? pitch : Mathf.Lerp(pitch, 6f, 0.06f), yaw, 0f);
            if (phase == Phase.City)
            {
                var want = new Vector3(0f, 78f, -126f);
                cam.transform.position = Vector3.Lerp(cam.transform.position, want, Time.deltaTime * 1.8f);
                cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, Quaternion.LookRotation(new Vector3(0f, 2f, 4f) - cam.transform.position), Time.deltaTime * 1.8f);
            }
            else
            {
                cam.transform.rotation = Quaternion.identity;
                cam.transform.position = new Vector3(0f, 2f, -dist);
            }

            if (phase == Phase.Menu && System.IO.File.Exists(Application.dataPath + "/.demo") && phaseTime > 3.5f && !_autoMenu)
            {
                _autoMenu = true;
                phase = Phase.Pick; phaseTime = 0f;
            }

            if (phase == Phase.Pick)
            {
                // 演示通道：Assets/.demo 存在时自动选第一颗星球（无需鼠标，便于录屏/截图验收）
                if (System.IO.File.Exists(Application.dataPath + "/.demo") && phaseTime > 2.5f && !_autoPick)
                {
                    _autoPick = true;
                    selectedWorld = 0; phase = Phase.City; phaseTime = 0f; StartCoroutine(SelectRoutine());
                }
                for (int k = 0; k < Worlds.Length; k++)
                {
                    if (Input.GetKeyDown(KeyCode.Alpha1 + k))
                    {
                        selectedWorld = k; phase = Phase.City; phaseTime = 0f; StartCoroutine(SelectRoutine());
                    }
                }
                hoveredWorld = PickWorldUnderMouse();
                if (hoveredWorld >= 0 && Input.GetMouseButtonDown(0))
                {
                    selectedWorld = hoveredWorld;
                    // 把选中的星球摆到正中，其余散开
                    phase = Phase.City;
                    phaseTime = 0f;
                    StartCoroutine(SelectRoutine());
                }
            }

            if (phase == Phase.City)
            {
                if (city != null)
                {
                    city.transform.Rotate(Vector3.up, Time.deltaTime * 3.5f, Space.World);
                    city.transform.localScale = Vector3.one * Mathf.Lerp(city.transform.localScale.x, 0.9f, Time.deltaTime * 2f);
                }
                if (phaseTime > 4.6f) BeginGame();
            }
        }

        System.Collections.IEnumerator SelectRoutine()
        {
            var w = Worlds[Mathf.Clamp(selectedWorld, 0, Worlds.Length - 1)];
            hoveredWorld = -1;

            // 现在主菜单是平面构成，没有 3D 星球实体；没有 body 就直接进白模
            if (w.body == null)
            {
                // 先压黑 0.55 秒，再建城，再淡出，别硬切
                float ft = 0f;
                while (ft < 0.55f) { ft += Time.deltaTime; yield return null; }
                if (city != null) Object.Destroy(city);
                cityBlocks.Clear();
                BuildCity();
                cityJustBuilt = true;
                phaseTime = 0f;
                Debug.Log($"[月壤箱] 进入世界 {w.name}（平面模式，直接白模）");
                yield break;
            }

            // 1. 该星球推到画面中央，并一路放大到铺满整屏
            Vector3 from = w.body.transform.localPosition;
            float fromScale = w.body.transform.localScale.x;
            // 让球直径 ≈ 屏幕高度的 1.5 倍，保证盖满画面
            float worldHeight = cam.orthographic ? cam.orthographicSize * 2f : cam.orthographicSize * 2f;
            float targetScale = worldHeight * 1.5f / Mathf.Max(0.01f, w.radius);
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime * 0.9f;
                float k = Mathf.SmoothStep(0f, 1f, t);
                w.body.transform.localPosition = Vector3.Lerp(from, new Vector3(0f, 1.6f, 22f), k);
                w.body.transform.localScale = Vector3.one * Mathf.Lerp(fromScale, targetScale, k);
                yield return null;
            }

            // 2. 屏息两秒，读介绍
            yield return new WaitForSeconds(1.6f);

            // 3. 星球化作城市白模
            w.body.gameObject.SetActive(false);
            for (int i = 0; i < Worlds.Length; i++)
            {
                var o = Worlds[i];
                if (o.body != null) o.body.gameObject.SetActive(false);
            }
            if (city != null) Object.Destroy(city);
            cityBlocks.Clear();
            BuildCity();
            phaseTime = 0f;
            Debug.Log($"[月壤箱] 进入世界 {w.name} / 开场产业 {w.industry}");
        }

        void BuildCity()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.66f, 0.66f, 0.67f);

            city = new GameObject("CityBlockout");
            city.transform.position = new Vector3(0f, 0.6f, 6.5f);
            city.transform.localScale = Vector3.one * 0.55f;

            var rnd = new System.Random(20261106);
            Material concrete = MakeMaterial(new Color(0.70f, 0.69f, 0.67f), 0f);
            Material concreteDark = MakeMaterial(new Color(0.55f, 0.55f, 0.55f), 0f);
            Material concreteLight = MakeMaterial(new Color(0.80f, 0.79f, 0.76f), 0f);
            Material asphalt = MakeMaterial(new Color(0.26f, 0.27f, 0.28f), 0f);
            Material paint = MakeMaterial(new Color(0.86f, 0.85f, 0.80f), 0f);
            Material glass = MakeMaterial(new Color(0.40f, 0.46f, 0.50f), 0f);
            Material green = MakeMaterial(new Color(0.34f, 0.42f, 0.34f), 0f);

            System.Action<float, float, float, float, float, float, Material> box = (cx, cy, cz, sx, sy, sz, mat) =>
            {
                var b = GameObject.CreatePrimitive(PrimitiveType.Cube);
                b.name = "b";
                b.transform.SetParent(city.transform, false);
                b.transform.localPosition = new Vector3(cx, cy, cz);
                b.transform.localScale = new Vector3(sx, sy, sz);
                b.GetComponent<MeshRenderer>().material = mat;
                Object.Destroy(b.GetComponent<Collider>());
                cityBlocks.Add(b.transform);
            };

            // ── 路网：6×6 街区，道路宽 8，街区 22，总幅 178
            const int N = 6;
            const float BLOCK = 22f, ROAD = 8f;
            float span = N * BLOCK + (N + 1) * ROAD;
            box(0f, 0.05f, 0f, span, 0.1f, span, asphalt);
            for (int i = 0; i <= N; i++)
            {
                float p = -span * 0.5f + ROAD * 0.5f + i * (BLOCK + ROAD);
                box(p, 0.12f, 0f, ROAD, 0.14f, span, asphalt);
                box(0f, 0.12f, p, span, 0.14f, ROAD, asphalt);
                // 中线
                box(p, 0.20f, 0f, 0.4f, 0.05f, span, paint);
                box(0f, 0.20f, p, span, 0.05f, 0.4f, paint);
            }

            // ── 等高线地形：几层退台地块，像等高线地图的截面
            Material rock1 = MakeMaterial(new Color(0.46f, 0.45f, 0.43f), 0f);
            Material rock2 = MakeMaterial(new Color(0.38f, 0.37f, 0.36f), 0f);
            Material rock3 = MakeMaterial(new Color(0.31f, 0.30f, 0.30f), 0f);
            Material water = MakeMaterial(new Color(0.22f, 0.32f, 0.38f), 0f);
            box(0f, -2.2f, 0f, span * 1.55f, 3.2f, span * 1.55f, rock3);
            box(0f, -0.8f, 0f, span * 1.18f, 1.4f, span * 1.18f, rock2);
            box(0f, -0.15f, 0f, span * 1.02f, 0.5f, span * 1.02f, rock1);

            // 河道：从西北斜穿到东南，压在地块上
            for (int i = -3; i <= 3; i++)
            {
                box(i * 26f, 0.16f, -i * 26f, 26f, 0.3f, 12f, water);
            }
            // 河上两道桥
            box(-26f, 1.0f, 26f, 10f, 1.2f, 6f, concreteLight);
            box(26f, 1.0f, -26f, 10f, 1.2f, 6f, concreteLight);

            // 山脉：城市边缘的梯级山体（等高线感的台阶）
            for (int mm = 0; mm < 3; mm++)
            {
                float ang = mm * 2.2f + 0.6f;
                float mx = Mathf.Cos(ang) * span * 0.62f;
                float mz = Mathf.Sin(ang) * span * 0.62f;
                for (int lv = 0; lv < 5; lv++)
                {
                    float sz = 34f - lv * 6f;
                    box(mx, 1.2f + lv * 2.6f, mz, sz, 2.6f, sz, lv < 2 ? rock1 : (lv < 4 ? rock2 : rock3));
                }
            }

            // 高架铁路 + 列车
            box(0f, 9.2f, span * 0.42f, span * 1.02f, 0.8f, 3.2f, concreteDark);
            for (int c = -3; c <= 3; c++)
                box(c * 22f, 4.6f, span * 0.42f, 1.6f, 9.2f, 1.6f, concrete);
            for (int t = 0; t < 4; t++)
                box(-40f + t * 11f, 10.4f, span * 0.42f, 9.6f, 2.6f, 2.6f, glass);

            // ── 中央：水泥核巨构（占用 2×2 街区）
            box(0f, 9f, 0f, 30f, 18f, 30f, concreteDark);
            box(0f, 21f, 0f, 22f, 8f, 22f, concrete);
            box(0f, 28.5f, 0f, 14f, 7f, 14f, concreteLight);
            box(0f, 34f, 0f, 8f, 4f, 8f, concreteDark);
            for (int k = 0; k < 4; k++)
            {
                float a = k * 90f * Mathf.Deg2Rad;
                float dx = Mathf.Cos(a), dz = Mathf.Sin(a);
                box(dx * 26f, 19f, dz * 26f, Mathf.Abs(dx) * 26f + 5f, 1.2f, Mathf.Abs(dz) * 26f + 5f, concreteLight);
                box(dx * 36f, 12f, dz * 36f, 2.6f, 15f, 2.6f, concreteDark);
            }

            // ── 其余街区：居民区 / 商业区 / 学校 / 车站 / 地铁口 / 公园
            for (int ix = 0; ix < N; ix++)
            {
                for (int iz = 0; iz < N; iz++)
                {
                    float cx = -span * 0.5f + ROAD + BLOCK * 0.5f + ix * (BLOCK + ROAD);
                    float cz = -span * 0.5f + ROAD + BLOCK * 0.5f + iz * (BLOCK + ROAD);
                    if (System.Math.Abs(cx) < 40f && System.Math.Abs(cz) < 40f) continue; // 中央已建

                    bool school = (ix == 0 && iz == 4);
                    bool station = (ix == 5 && iz == 1);
                    bool metro = (ix == 2 && iz == 4);
                    bool park = (ix == 4 && iz == 4);

                    if (school)
                    {
                        box(cx, 3.5f, cz - 4f, 18f, 7f, 10f, concreteLight);
                        box(cx - 6f, 2.5f, cz + 7f, 6f, 5f, 8f, concreteLight);
                        box(cx + 4f, 0.3f, cz + 7f, 12f, 0.4f, 9f, green);
                        continue;
                    }
                    if (station)
                    {
                        box(cx, 0.4f, cz, 20f, 0.8f, 20f, concreteDark);
                        box(cx, 5.5f, cz, 24f, 1.4f, 12f, concreteLight);       // 站房大屋顶
                        box(cx, 9f, cz - 5.5f, 24f, 0.6f, 1.2f, concreteLight);   // 雨棚
                        for (int c = -1; c <= 1; c++) box(cx + c * 9f, 2.8f, cz + 5f, 1.2f, 5.6f, 1.2f, concrete);
                        box(cx, 2.6f, cz + 4.5f, 18f, 0.5f, 6f, paint);           // 站台
                        box(cx, 0.6f, cz - 8.5f, 26f, 0.7f, 3f, asphalt);         // 铁轨路基
                        continue;
                    }
                    if (metro)
                    {
                        box(cx - 4f, 2.2f, cz, 8f, 4.4f, 8f, concreteLight);
                        box(cx - 4f, 4.6f, cz, 9f, 0.6f, 9f, concreteDark);
                        box(cx + 6f, 1.4f, cz, 4f, 2.8f, 10f, concreteDark);     // 出入口坡道
                        box(cx + 6f, 0.4f, cz, 4f, 0.6f, 10f, asphalt);
                        continue;
                    }
                    if (park)
                    {
                        box(cx, 0.3f, cz, 18f, 0.5f, 18f, green);
                        for (int t = 0; t < 6; t++)
                        {
                            float tx = cx + ((float)rnd.NextDouble() - 0.5f) * 14f;
                            float tz = cz + ((float)rnd.NextDouble() - 0.5f) * 14f;
                            box(tx, 2f, tz, 0.6f, 4f, 0.6f, concreteDark);
                            box(tx, 4.4f, tz, 3.2f, 1.2f, 3.2f, green);
                        }
                        continue;
                    }

                    // 商业 vs 居民：奇数街区做商业（高层 + 裙房），偶数做居民（板楼 + 阳台）
                    bool commercial = (ix + iz) % 3 == 1;
                    if (commercial)
                    {
                        box(cx, 2.5f, cz, 17f, 5f, 17f, concrete);              // 裙房
                        int towers = 2 + rnd.Next(2);
                        for (int t = 0; t < towers; t++)
                        {
                            float ox = (t - (towers - 1) * 0.5f) * 6.4f;
                            float h = 14f + (float)rnd.NextDouble() * 12f;
                            box(cx + ox, 5f + h * 0.5f, cz, 4.4f, h, 4.4f, concreteDark);
                            box(cx + ox, 5f + h + 2.4f, cz, 3f, 4.8f, 3f, glass);
                        }
                    }
                    else
                    {
                        int rows = 2 + rnd.Next(2);
                        for (int r = 0; r < rows; r++)
                        {
                            float oz = (r - (rows - 1) * 0.5f) * 7.2f;
                            float h = 7f + (float)rnd.NextDouble() * 6f;
                            box(cx, h * 0.5f, cz + oz, 17f, h, 5.2f, concreteLight);   // 板楼
                            // 阳台条
                            for (int b = -3; b <= 3; b++)
                                box(cx + b * 2.4f, h * 0.55f, cz + oz + 2.8f, 1.6f, 0.5f, 1.2f, concreteDark);
                        }
                        box(cx, 0.3f, cz + 8f, 17f, 0.5f, 3f, green);
                    }
                }
            }

            // 一盏顶光，让白模有体积
            var lgo = new GameObject("CityLight");
            lgo.transform.SetParent(city.transform, false);
            var l = lgo.AddComponent<Light>();
            l.type = LightType.Directional;
            l.intensity = 1.35f;
            l.transform.rotation = Quaternion.Euler(52f, -38f, 0f);

            var fill = new GameObject("CityFill");
            fill.transform.SetParent(city.transform, false);
            var fl = fill.AddComponent<Light>();
            fl.type = LightType.Directional;
            fl.intensity = 1.1f;
            fl.transform.rotation = Quaternion.Euler(28f, -150f, 0f);

            var moon = new GameObject("CityGround");
            moon.transform.SetParent(city.transform, false);
            var q = GameObject.CreatePrimitive(PrimitiveType.Plane);
            q.transform.SetParent(moon.transform, false);
            q.transform.localScale = Vector3.one * 3.2f;
            q.transform.localPosition = new Vector3(0f, 0.02f, 0f);
            q.GetComponent<MeshRenderer>().material = MakeMaterial(new Color(0.86f, 0.86f, 0.85f), 0f);
            Object.Destroy(q.GetComponent<Collider>());
        }

        int PickWorldUnderMouse()
        {
            if (cam == null) return -1;
            var ray = cam.ScreenPointToRay(Input.mousePosition);
            for (int i = 0; i < Worlds.Length; i++)
            {
                var w = Worlds[i];
                if (w.body == null) continue;
                var p = w.body.transform.position;
                var toRay = p - ray.origin;
                float along = Vector3.Dot(toRay, ray.direction);
                if (along < 0f) continue;
                var closest = ray.origin + ray.direction * along;
                if ((closest - p).magnitude < w.radius * 2.4f) return i;
            }
            return -1;
        }

        static bool _menuTested;

        public static void Play(string name, float vol = 0.5f)
        {
            if (!soundOn) return;
            if (sfx == null)
            {
                var go = new GameObject("[sfx]");
                Object.DontDestroyOnLoad(go);
                sfx = go.AddComponent<AudioSource>();
                sfx.playOnAwake = false;
            }
            var clip = Resources.Load<AudioClip>("Audio/" + name);
            if (clip != null) sfx.PlayOneShot(clip, vol);
        }

        public static void Ambient()
        {
            if (!soundOn) return;
            if (sfx == null) Play("click", 0f);
            if (sfx == null || sfx.isPlaying) return;
            var clip = Resources.Load<AudioClip>("Audio/ambient");
            if (clip == null) return;
            sfx.clip = clip;
            sfx.loop = true;
            sfx.volume = 0.18f;
            sfx.Play();
        }

        public static void Click()
        {
            if (!soundOn) return;
            if (sfx == null)
            {
                var go = new GameObject("[sfx]");
                Object.DontDestroyOnLoad(go);
                sfx = go.AddComponent<AudioSource>();
                sfx.playOnAwake = false;
            }
            var clip = Resources.Load<AudioClip>("Audio/click");
            if (clip != null) sfx.PlayOneShot(clip, 0.5f);
        }

        void Activate(int i)
        {
            switch (i)
            {
                case 0:
                    Game.LoadSaveOnStart = false;
                    phase = Phase.Pick;
                    phaseTime = 0f;
                    break;
                case 1:
                    phase = Phase.Slots;
                    phaseTime = 0f;
                    break;
                case 2:
                    infoTitle = "画廊";
                    infoBody = "一共十张案卷插画。\n现在还没画，只有文字。\n等图出来再挂上去。";
                    phase = Phase.Info;
                    break;
                case 3:
                    infoTitle = "设置";
                    infoBody = SoundLine();
                    phase = Phase.Info;
                    break;
                case 4:
                    infoTitle = "开发者说明";
                    infoBody = "月壤箱 v0.0.1\n规则层照搬 godot 版 src/game.gd。\n具体场景走 2D，大地图留给 3D。\n美术暂用占位图。";
                    phase = Phase.Info;
                    break;
                case 5:
                    Application.Quit();
                    break;
                default:
                    break;
            }
        }

        public static bool UseCardMode = true;

        void BeginGame()
        {
            if (city != null) Destroy(city);
            foreach (var w in Worlds) if (w.body != null) Destroy(w.body.gameObject);
            if (stars != null) Destroy(stars.gameObject);
            if (UseCardMode) CardTable.Boot();
            else Game.Arm();
            Destroy(gameObject);
        }

        // ── 视觉：复古未来主义（墨蓝底 + 米白细线 + 琥珀强调）─────────────────
        static Texture2D _px;
        static Texture2D Px
        {
            get
            {
                if (_px == null)
                {
                    _px = new Texture2D(1, 1, TextureFormat.RGBA32, false);
                    _px.SetPixel(0, 0, Color.white);
                    _px.Apply();
                }
                return _px;
            }
        }

        static readonly Color Cream = new Color(0.93f, 0.90f, 0.84f);
        static readonly Color Amber = new Color(0.85f, 0.64f, 0.25f);
        static readonly Color Dim = new Color(0.62f, 0.61f, 0.58f);

        static void Line(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, Px);
            GUI.color = old;
        }

        /// <summary>四角细括号 + 内描边，构成主义那种框架感。</summary>
        static string SoundLine()
        {
            return "音效：" + (soundOn ? "开" : "关") + "\n按 S 切换音效，按 D 删除存档。\n（窗口分辨率由 Game 视图决定）";
        }

        void DrawSlots(float w, float h, float margin)
        {
            Color cream = new Color(0.93f, 0.90f, 0.84f, 1f);
            Color teal = new Color(0.42f, 0.82f, 0.78f, 1f);

            GUI.color = cream;
            GUI.Label(new Rect(margin, margin, w * 0.6f, 34f), "读取存档",
                      new GUIStyle(GUI.skin.label) { fontSize = 24, fontStyle = FontStyle.Bold, font = HardFont() });

            // 横向三条，像档案抽屉，不是竖着的手牌
            float lw = Mathf.Min(w * 0.52f, h * 1.05f);
            float rh = Mathf.Min(h * 0.14f, 78f);
            float gap = rh * 0.24f;
            float x0 = (w - lw) * 0.5f;
            float y0 = h * 0.34f;

            for (int i = 0; i < 3; i++)
            {
                var r = new Rect(x0, y0 + i * (rh + gap), lw, rh);
                string sum = GameState.SlotSummary(i);
                bool has = sum != "";
                bool hot = r.Contains(Event.current.mousePosition);

                UiStyle.Fill(r, new Color(0.045f, 0.05f, 0.06f, has ? 0.88f : 0.48f));
                UiStyle.Frame(r, has ? (hot ? 0.95f : 0.40f) : 0.16f, has ? 6f : 4f);
                if (has && hot) UiStyle.Fill(new Rect(r.x, r.yMax - 2f, r.width, 2f), UiStyle.Amber);

                GUI.color = has ? (hot ? new Color(0.88f, 0.48f, 0.22f, 1f) : cream) : new Color(cream.r, cream.g, cream.b, 0.40f);
                GUI.Label(new Rect(r.x + 18f, r.y + rh * 0.16f, r.width * 0.4f, rh * 0.34f), "档位 0" + (i + 1),
                          new GUIStyle(GUI.skin.label) { fontSize = 17, font = HardFont() });

                GUI.color = has ? teal : new Color(cream.r, cream.g, cream.b, 0.28f);
                GUI.Label(new Rect(r.x + 18f, r.y + rh * 0.56f, r.width - 36f, rh * 0.30f), has ? sum : "空档",
                          new GUIStyle(GUI.skin.label) { fontSize = 12, font = HardFont() });

                if (has)
                {
                    GUI.color = new Color(cream.r, cream.g, cream.b, hot ? 0.85f : 0.35f);
                    GUI.Label(new Rect(r.xMax - 78f, r.y + rh * 0.30f, 60f, rh * 0.4f), "读取 ›",
                              new GUIStyle(GUI.skin.label) { fontSize = 13, alignment = TextAnchor.MiddleRight, font = HardFont() });
                }

                if (has && hot && Event.current.type == EventType.MouseDown && Event.current.button == 0)
                {
                    Game.SlotToLoad = i;
                    Game.LoadSaveOnStart = true;
                    BeginGame();
                    Event.current.Use();
                    return;
                }
            }

            GUI.color = new Color(cream.r, cream.g, cream.b, 0.45f);
            GUI.Label(new Rect(margin, h - margin - 20f, w * 0.5f, 16f), "ESC 返回",
                      new GUIStyle(GUI.skin.label) { fontSize = 12, font = HardFont() });

            if (Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Escape)
            {
                phase = Phase.Menu;
                phaseTime = 0f;
                Event.current.Use();
            }
        }

        void HandleInfo()
        {
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Return) || Input.GetMouseButtonDown(0))
            {
                phase = Phase.Menu;
                phaseTime = 0f;
            }
            if (Input.GetKeyDown(KeyCode.S))
            {
                soundOn = !soundOn;
                infoBody = SoundLine();
            }
            if (Input.GetKeyDown(KeyCode.D))
            {
                var path = Application.persistentDataPath + "/yueliangxiang.save.json";
                if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
                infoBody = "存档已删除。\n按 Esc 返回。";
            }
        }

        void DrawInfo()
        {
            float w = Screen.width, h = Screen.height;
            Fill(new Rect(0, 0, w, h), new Color(0.03f, 0.05f, 0.06f, 1f));

            var cap = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.062f), fontStyle = FontStyle.Bold, font = HardFont() };
            cap.normal.textColor = Cream;
            GUI.Label(new Rect(w * 0.12f, h * 0.16f, w * 0.7f, h * 0.1f), infoTitle, cap);

            var body = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.036f), wordWrap = true, font = HardFont() };
            body.normal.textColor = Cream;
            GUI.Label(new Rect(w * 0.12f, h * 0.32f, w * 0.7f, h * 0.45f), infoBody, body);

            // 右侧留两格立绘位
            float pw = w * 0.20f, px = w - w * 0.08f - pw;
            float py = h * 0.18f, ph = h * 0.62f, gap = h * 0.02f;
            float pslot = (ph - gap) / 2f;
            var bay = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.024f), alignment = TextAnchor.MiddleCenter };
            bay.normal.textColor = new Color(0.66f, 0.63f, 0.58f, 0.75f);
            for (int i = 0; i < 2; i++)
            {
                var pr = new Rect(px, py + i * (pslot + gap), pw, pslot);
                var line = new Color(0.55f, 0.52f, 0.46f, 0.35f);
                Fill(new Rect(pr.x, pr.y, pr.width, 1f), line);
                Fill(new Rect(pr.x, pr.yMax - 1f, pr.width, 1f), line);
                Fill(new Rect(pr.x, pr.y, 1f, pr.height), line);
                Fill(new Rect(pr.xMax - 1f, pr.y, 1f, pr.height), line);
                GUI.Label(pr, "立绘 " + (i + 1), bay);
            }

            var foot = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.028f) };
            foot.normal.textColor = new Color(0.72f, 0.70f, 0.66f, 0.9f);
            GUI.Label(new Rect(w * 0.12f, h * 0.86f, w * 0.7f, 20f), "Esc 返回", foot);
        }

        static Texture2D _white;
        static void Fill(Rect r, Color c)
        {
            if (_white == null) { _white = new Texture2D(1, 1); _white.SetPixel(0, 0, Color.white); _white.Apply(); }
            var k = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, _white);
            GUI.color = k;
        }

        static bool cityJustBuilt;

        void DrawCityOverlay()
        {
            float w = Screen.width, h = Screen.height;
            float t = phaseTime;

            // 顶部小字：坐标风格
            var tag = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.026f), font = HardFont() };
            tag.normal.textColor = new Color(0.86f, 0.84f, 0.79f, Mathf.Clamp01((t - 0.2f) / 0.5f) * 0.85f);
            GUI.Label(new Rect(w * 0.12f, h * 0.14f, w * 0.7f, 20f), "", tag);

            // 压暗背景，保证字压得住
            float a = Mathf.Clamp01((t - 0.5f) / 0.7f);
            Fill(new Rect(0, 0, w, h), new Color(0.02f, 0.04f, 0.05f, 0.62f * a));
            var cap = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.070f), fontStyle = FontStyle.Bold, font = HardFont() };
            cap.normal.textColor = new Color(0.96f, 0.95f, 0.92f, a);
            GUI.Label(new Rect(w * 0.12f, h * 0.56f, w * 0.7f, h * 0.10f), "", cap);

            var sub = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(h * 0.032f), font = HardFont() };
            sub.normal.textColor = new Color(0.80f, 0.78f, 0.74f, Mathf.Clamp01((t - 1.4f) / 0.6f) * 0.95f);
            GUI.Label(new Rect(w * 0.12f, h * 0.66f, w * 0.7f, 26f), "降落在 殡仪馆", sub);

            // 黑幕：进来先压黑，建城后淡出
            float fade = cityJustBuilt
                ? Mathf.Clamp01(1f - t / 0.65f)
                : Mathf.Clamp01(t / 0.5f);
            if (fade > 0.001f) Fill(new Rect(0, 0, w, h), new Color(0f, 0f, 0f, fade));
            if (cityJustBuilt && t > 0.7f) cityJustBuilt = false;
        }

        void DrawFrame()
        {
            float m = 26f, len = 34f;
            var hair = new Color(Cream.r, Cream.g, Cream.b, 0.22f);
            Line(new Rect(m, m, Screen.width - m * 2f, 1f), hair);
            Line(new Rect(m, Screen.height - m, Screen.width - m * 2f, 1f), hair);
            Line(new Rect(m, m, 1f, Screen.height - m * 2f), hair);
            Line(new Rect(Screen.width - m, m, 1f, Screen.height - m * 2f), hair);

            var strong = new Color(Amber.r, Amber.g, Amber.b, 0.85f);
            Line(new Rect(m, m, len, 2f), strong); Line(new Rect(m, m, 2f, len), strong);
            Line(new Rect(Screen.width - m - len, m, len, 2f), strong); Line(new Rect(Screen.width - m - 2f, m, 2f, len), strong);
            Line(new Rect(m, Screen.height - m - 2f, len, 2f), strong); Line(new Rect(m, Screen.height - m - len, 2f, len), strong);
            Line(new Rect(Screen.width - m - len, Screen.height - m - 2f, len, 2f), strong);
            Line(new Rect(Screen.width - m - 2f, Screen.height - m - len, 2f, len), strong);
        }

        static Texture2D _ring, _vig, _scan;
        static bool _built;

        /// <summary>星盘 / 暗角 / 扫描线，只烘一次。</summary>
        static void BuildTextures()
        {
            if (_built) return;
            _built = true;

            const int s = 512;
            _ring = new Texture2D(s, s, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[s * s];
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    float dx = (x - s * 0.5f) / (s * 0.5f);
                    float dy = (y - s * 0.5f) / (s * 0.5f);
                    float r = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = 0f;
                    a = Mathf.Max(a, 1f - Mathf.Clamp01(Mathf.Abs(r - 0.982f) / 0.006f));
                    a = Mathf.Max(a, 0.55f * (1f - Mathf.Clamp01(Mathf.Abs(r - 0.865f) / 0.004f)));
                    a = Mathf.Max(a, 0.30f * (1f - Mathf.Clamp01(Mathf.Abs(r - 0.640f) / 0.003f)));

                    float ang = Mathf.Atan2(dy, dx);
                    float t = (ang + Mathf.PI) / (Mathf.PI * 2f) * 60f;
                    float tf = Mathf.Abs(t - Mathf.Round(t));
                    bool longTick = Mathf.Abs(Mathf.Round(t) % 5f) < 0.5f;
                    float inner = longTick ? 0.900f : 0.935f;
                    if (r > inner && r < 0.975f && tf < 0.07f)
                        a = Mathf.Max(a, longTick ? 0.90f : 0.42f);

                    px[y * s + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(a) * 255f));
                }
            _ring.SetPixels32(px);
            _ring.Apply();

            _vig = new Texture2D(64, 64, TextureFormat.RGBA32, false);
            var vp = new Color32[64 * 64];
            for (int y = 0; y < 64; y++)
                for (int x = 0; x < 64; x++)
                {
                    float dx = (x - 31.5f) / 32f, dy = (y - 31.5f) / 32f;
                    float r = Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy));
                    float a = Mathf.Clamp01((r - 0.42f) / 0.58f);
                    vp[y * 64 + x] = new Color32(3, 5, 8, (byte)(a * 205f));
                }
            _vig.SetPixels32(vp);
            _vig.wrapMode = TextureWrapMode.Clamp;
            _vig.Apply();

            _scan = new Texture2D(1, 4, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat };
            _scan.SetPixels32(new[]
            {
                new Color32(0, 0, 0, 24), new Color32(0, 0, 0, 0),
                new Color32(0, 0, 0, 0), new Color32(0, 0, 0, 0)
            });
            _scan.Apply();
        }

        static Font _hard;
        static Font HardFont()
        {
            if (_hard == null)
                _hard = Font.CreateDynamicFontFromOSFont(new[] { "Microsoft YaHei UI", "Microsoft YaHei", "SimHei", "Arial" }, 48);
            return _hard;
        }

        static Texture2D _dot;

        static void BuildDot()
        {
            if (_dot != null) return;
            const int n = 64;
            _dot = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = (x - (n - 1) * 0.5f) / (n * 0.5f);
                    float dy = (y - (n - 1) * 0.5f) / (n * 0.5f);
                    float r = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = Mathf.Clamp01((1f - r) * 34f);
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255f));
                }
            _dot.SetPixels32(px);
            _dot.Apply();
        }

        static void Panel(Rect r, float rad, Color c)
        {
            var keep = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(new Rect(r.x + rad, r.y + rad, r.width - rad * 2f, r.height - rad * 2f), Px);
            GUI.DrawTexture(new Rect(r.x + rad, r.y, r.width - rad * 2f, rad), Px);
            GUI.DrawTexture(new Rect(r.x + rad, r.y + r.height - rad, r.width - rad * 2f, rad), Px);
            GUI.DrawTexture(new Rect(r.x, r.y + rad, rad, r.height - rad * 2f), Px);
            GUI.DrawTexture(new Rect(r.x + r.width - rad, r.y + rad, rad, r.height - rad * 2f), Px);
            float d = rad * 2f;
            GUI.DrawTexture(new Rect(r.x, r.y, d, d), _dot);
            GUI.DrawTexture(new Rect(r.x + r.width - d, r.y, d, d), _dot);
            GUI.DrawTexture(new Rect(r.x, r.y + r.height - d, d, d), _dot);
            GUI.DrawTexture(new Rect(r.x + r.width - d, r.y + r.height - d, d, d), _dot);
            GUI.color = keep;
        }

        static bool _cityShot;

        // 后台低帧率时 frameCount%120 要等半分钟以上，改用真实时间节流
        static double _lastMenuShot;

        void ShotIfAsked()
        {
            if (!System.IO.File.Exists(Application.dataPath + "/.shot")) return;
            if (phase == Phase.City)
            {
                if (!_cityShot && phaseTime > 3.2f) { _cityShot = true; ScreenCapture.CaptureScreenshot("F:/job/oc-game/unity/_shots/city_full.png"); }
                return;
            }
            // 每次都刷新，保证贴给她的图就是当前构建
            if (Time.realtimeSinceStartup < 1f) return;
            if (Time.realtimeSinceStartup - _lastMenuShot < 0.75) return;
            _lastMenuShot = Time.realtimeSinceStartup;
            ScreenCapture.CaptureScreenshot("F:/job/oc-game/unity/_shots/menu_full.png");
        }

        static Texture2D _scrim;
        static Texture2D ScrimTex()
        {
            if (_scrim != null) return _scrim;
            const int W = 256, H = 4;
            _scrim = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[W * H];
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float t = x / (float)(W - 1);
                    float a = Mathf.Pow(1f - t, 1.7f) * 0.82f;
                    px[y * W + x] = new Color(0.045f, 0.035f, 0.065f, a);
                }
            _scrim.SetPixels32(px); _scrim.Apply();
            return _scrim;
        }

        void OnGUI()
        {
            ShotIfAsked();
            if (phase == Phase.City) { DrawCityOverlay(); return; }
            if (phase == Phase.Slots) { DrawSlots(Screen.width, Screen.height, Mathf.Max(28f, Screen.height * 0.055f)); return; }
            if (phase == Phase.Info) { HandleInfo(); DrawInfo(); return; }
            float w = Screen.width, h = Screen.height;
            // 左侧压一层横向渐变，文字与星云之间有个软过渡，不至于互相咬
            GUI.DrawTexture(new Rect(0f, 0f, w * 0.5f, h), ScrimTex(), ScaleMode.StretchToFill);
            float margin = Mathf.Max(28f, h * 0.055f);
            MenuGfx.Mode = (phase == Phase.Pick || phase == Phase.City) ? 1 : 0;
            MenuGfx.Draw(w, h, margin, Time.time);
            Color cream = new Color(0.93f, 0.90f, 0.84f, 1f);
            Color teal = new Color(0.42f, 0.82f, 0.78f, 1f);
            Color orange = new Color(0.88f, 0.48f, 0.22f, 1f);

            var keep = GUI.color;
            float lx = margin * 1.5f;
            float lw = Mathf.Min(w * 0.34f, 470f);

            var capTitle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.RoundToInt(Mathf.Min(lw * 0.20f, h * 0.10f)),
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.UpperLeft,
                font = HardFont()
            };
            var latin = new GUIStyle(GUI.skin.label) { fontSize = 13, alignment = TextAnchor.UpperLeft };
            var triad = new GUIStyle(GUI.skin.label) { fontSize = 12, alignment = TextAnchor.UpperLeft };
            var itemStyle = new GUIStyle(GUI.skin.label) { fontSize = 21, alignment = TextAnchor.MiddleLeft, font = HardFont(), clipping = TextClipping.Overflow };
            var micro = new GUIStyle(GUI.skin.label) { fontSize = 10, alignment = TextAnchor.UpperLeft };

            float ty = h * 0.27f;
            if (!_menuTested && phase == Phase.Menu && phaseTime > 1.2f && System.IO.File.Exists(Application.dataPath + "/.menutest"))
            {
                _menuTested = true;
                Activate(2);
            }

            if (phase == Phase.Menu)
            {
                GUI.color = cream;
                GUI.Label(new Rect(lx, ty, lw, capTitle.fontSize * 1.2f), "月壤箱", capTitle);
                GUI.color = orange;
                GUI.Label(new Rect(lx + 2f, ty + capTitle.fontSize * 1.28f + 22f, lw, 30f), "Delirium · Dissociation · Demiurge", triad);
            }

            float ly = ty + capTitle.fontSize * 1.18f;

            if (!_menuTested && phase == Phase.Menu && phaseTime > 1.2f && System.IO.File.Exists(Application.dataPath + "/.menutest"))
            {
                _menuTested = true;
                Activate(2);
            }

            if (phase == Phase.Menu)
            {
                string[] items = { "新游戏", "读取存档", "画廊", "设置", "开发者说明", "退出游戏" };
                // 键盘导航（与外框点击并行，方便演示与无鼠标环境）
                if (Event.current.type == EventType.KeyDown)
                {
                    if (Event.current.keyCode == KeyCode.DownArrow) menuIndex = (menuIndex + 1) % items.Length;
                    else if (Event.current.keyCode == KeyCode.UpArrow) menuIndex = (menuIndex + items.Length - 1) % items.Length;
                    else if (Event.current.keyCode == KeyCode.KeypadEnter || Event.current.keyCode == KeyCode.Return)
                    {
                        Activate(menuIndex);
                    }
                    Event.current.Use();
                }
                float y0 = ly + 96f;
                float rowH = Mathf.Min(46f, (h - margin - 40f - y0) / items.Length);

                for (int i = 0; i < items.Length; i++)
                {
                    var r = new Rect(lx, y0 + i * rowH, lw, rowH - 8f);
                    bool hot = r.Contains(Event.current.mousePosition) || menuIndex == i;

                    if (hot) { float cy = r.y + r.height * 0.5f; Line(new Rect(r.x - 12f, cy - 11f, 2f, 22f), orange); }

                    GUI.color = new Color(cream.r, cream.g, cream.b, hot ? 1f : 0.66f);
                    GUI.Label(new Rect(r.x, r.y, lw, rowH - 6f), items[i], itemStyle);
                    GUI.color = keep;

                    if (r.Contains(Event.current.mousePosition) && Event.current.type == EventType.MouseDown && Event.current.button == 0)
                    {
                        Activate(i);
                        Event.current.Use();
                    }
                }

                GUI.color = new Color(cream.r, cream.g, cream.b, 0.34f);
                GUI.Label(new Rect(lx, h - margin - 14f, lw * 1.4f, 14f), "拖动转视角　·　点击进入　·　ESC 返回", micro);
            }
            else
            {
                int pick = selectedWorld >= 0 ? selectedWorld : hoveredWorld;
                if (pick >= 0)
                {
                    var wd = Worlds[pick];
                    GUI.color = cream;
                    GUI.Label(new Rect(lx, h - margin - 168f, lw, 30f), wd.name,
                              new GUIStyle(GUI.skin.label) { fontSize = 24, fontStyle = FontStyle.Bold, font = HardFont() });
                    GUI.color = teal;
                    GUI.Label(new Rect(lx + 1f, h - margin - 136f, lw, 16f), wd.industry + " · " + wd.genre, latin);
                    GUI.color = new Color(cream.r, cream.g, cream.b, 0.62f);
                    GUI.Label(new Rect(lx + 1f, h - margin - 112f, lw, 70f), wd.intro,
                              new GUIStyle(GUI.skin.label) { fontSize = 11, wordWrap = true });
                }
                else
                {
                    GUI.color = new Color(cream.r, cream.g, cream.b, 0.44f);
                    GUI.Label(new Rect(lx, h - margin - 26f, lw * 1.4f, 16f), "拖动选择星球，点一下进去", micro);
                }
            }

            GUI.color = Color.white;
        }
    }
}
