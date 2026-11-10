using System.Collections.Generic;
using UnityEngine;

namespace Yueliangxiang
{
    /// <summary>
    /// 规则层：从 godot 的 src/game.gd 逐条搬过来，不碰 UI。
    /// 一单 = 一条案卷；五道工序 = 收尸/洗身/穿衣/念辞/出殡。
    /// </summary>
    public class GameState
    {
        public static readonly string[] Stages = { "收尸", "洗身", "穿衣", "念辞", "出殡" };

        public struct Risk
        {
            public string name;
            public int baseValue;
            public Risk(string n, int b) { name = n; baseValue = b; }
        }

        public static readonly Dictionary<string, Risk> Risks = new Dictionary<string, Risk>
        {
            { "寿终", new Risk("安", 0) },
            { "病故", new Risk("稳", 10) },
            { "横死", new Risk("凶", 35) },
            { "怨死", new Risk("厉", 60) },
            { "奇死", new Risk("邪", 85) },
        };

        public class Case
        {
            public string name;
            public int age;
            public string cause;
            public string family;
            public string wish;
            public string grudge;
            public int worth;
            public bool special;
            public int risk;
            public int grudgeNow;
        }

        public class Choice
        {
            public string label;
            public int cost;
            public int grudge;
            public int money;
            public Dictionary<string, int> rep = new Dictionary<string, int>();
            public string flavor;
            public bool special;
            public int needRep;
        }

        public string playerName = "无名";
        public int playerGender = 0;   // 0 = 男视角，1 = 女视角

        // 开局设定：菜单里选好，进桌前灌进实例
        public static string ProfileName = "无名";
        public static int ProfileGender = 0;

        public int day = 1;
        public int hours = 6;

        // ── 经营：今天的雇工与耗材（数值在 Mgmt.cs，待定稿）──
        public bool hiredApprentice, hiredMakeup, hiredEmcee;   // 当天有效，日结清空
        public int incense, cloth;                              // 耗材库存，用一次减一

        public string mgmtNote = "";
        public int money = 0;
        public int repStreet = 50;
        public int repTrade = 50;
        public int repOfficial = 50;
        public int casesDone = 0;
        public List<string> log = new List<string>();
        public Case active;
        public int activeStage = 0;
        public List<Dictionary<string, int>> week = new List<Dictionary<string, int>>();

        public int tribute = 0;
        public bool demoDone = false;

        public Dictionary<string, int> rivals = new Dictionary<string, int>
        {
            { "全能之门", 50 }, { "壹祖", 50 }, { "势宗", 50 }, { "未知信仰", 50 }
        };
        public int officialHeat = 0;
        public Dictionary<string, object> lastDayReport;

        public int casinoGames = 0;
        public int[] lastDice = new int[3];

        static readonly System.Random Rng = new System.Random();

        static readonly Case[] Pool =
        {
            new Case { name="周三德", age=67, cause="寿终", family="无亲，居委会来办", wish="葬在老伴旁边", grudge="教里发过愿，没还上", worth=2200 },
            new Case { name="林巧", age=31, cause="横死", family="丈夫和上小学的儿子", wish="给孩子留句话", grudge="车祸那天车是借来的", worth=4600 },
            new Case { name="许国梁", age=55, cause="病故", family="一大家子，长子话多", wish="别让单位来", grudge="欠了老伙计一笔账", worth=3000 },
            new Case { name="沈老师", age=82, cause="寿终", family="学生凑的钱", wish="体面点", grudge="想把稿子烧了", worth=1800 },
            new Case { name="吴慧珍", age=44, cause="怨死", family="只有个不肯来的女儿", wish="别让那男人进门", grudge="眼里咽不下那口气", worth=3200 },
            new Case { name="不知名的男人", age=0, cause="奇死", family="没人认领", wish="查不到", grudge="身上有别人缝的针脚", worth=0, special=true },
            new Case { name="小满", age=9, cause="病故", family="妈妈一个人来", wish="想听个故事", grudge="病房里那盏灯", worth=1500 },
            new Case { name="老白", age=58, cause="病故", family="老伴还硬朗", wish="把那只猫送走", grudge="儿子八年没回来", worth=2400 },
            new Case { name="阿兰", age=23, cause="横死", family="同租的两个女孩", wish="把欠的钱还上", grudge="那天为什么要去天台", worth=3900 },
            new Case { name="钱伯", age=71, cause="寿终", family="远房侄子", wish="别大办", grudge="棺材想用自己打的那口", worth=5000 },
        };

        public int HoursLeft => hours;

        public int Rep(string kind)
        {
            switch (kind)
            {
                case "street": return repStreet;
                case "trade": return repTrade;
                case "official": return repOfficial;
            }
            return 0;
        }

        void AddRep(string kind, int delta)
        {
            switch (kind)
            {
                case "street": repStreet = Mathf.Clamp(repStreet + delta, 0, 100); break;
                case "trade": repTrade = Mathf.Clamp(repTrade + delta, 0, 100); break;
                case "official": repOfficial = Mathf.Clamp(repOfficial + delta, 0, 100); break;
            }
        }

        public Case DrawCase(int idx)
        {
            var src = Pool[((idx % Pool.Length) + Pool.Length) % Pool.Length];
            var c = new Case
            {
                name = src.name, age = src.age, cause = src.cause, family = src.family,
                wish = src.wish, grudge = src.grudge, worth = src.worth, special = src.special
            };
            c.risk = Risks[c.cause].baseValue + (idx % 3) * 3;
            c.grudgeNow = Mathf.Clamp(Risks[c.cause].baseValue - (hiredEmcee ? 3 : 0), 0, 100);
            return c;
        }

        public int[] TodayCases()
        {
            var outIdx = new int[4];
            for (int k = 0; k < 4; k++) outIdx[k] = (day * 4 + k * 2 + 1) % 10;
            return outIdx;
        }

        public List<Choice> ChoicesFor(int stage)
        {
            var list = new List<Choice>();
            switch (stage)
            {
                case 0:
                    list.Add(new Choice { label = "派徒弟去接", cost = 1, grudge = 2, money = -60, rep = { { "trade", -1 } }, flavor = "徒弟手脚麻利，就是毛手毛脚。" });
                    list.Add(new Choice { label = "亲自去接", cost = 2, grudge = -4, money = 0, rep = { { "street", 1 } }, flavor = "你亲自去了，街坊看在眼里。" });
                    list.Add(new Choice { label = "后半夜去，顺手刮点东西", cost = 2, grudge = -6, money = 0, flavor = "没人看见。刮下来的东西，能上供。", special = true });
                    break;
                case 1:
                    list.Add(new Choice { label = "细细擦洗", cost = 1, grudge = -5, money = 0, rep = { { "street", 1 }, { "trade", 1 } }, flavor = "把身子擦干净，算是对得起。" });
                    list.Add(new Choice { label = "冲一冲了事", cost = 0, grudge = 4, flavor = "水一冲就抬走了。" });
                    list.Add(new Choice { label = "不洗，盖白布", cost = 0, grudge = 10, rep = { { "street", -1 } }, flavor = "白布一盖，眼不见为净。" });
                    break;
                case 2:
                    list.Add(new Choice { label = "按规矩穿寿衣", cost = 1, grudge = -3, money = -120, rep = { { "trade", 1 } }, flavor = "寿衣料子一般，但规矩不能少。" });
                    list.Add(new Choice { label = "家属指定的衣裳", cost = 1, grudge = -4, money = -200, rep = { { "street", 2 } }, flavor = "家属递来的，穿上去才像那个人。" });
                    list.Add(new Choice { label = "简省点", cost = 0, grudge = 6, money = 40, rep = { { "trade", -1 } }, flavor = "省下这身衣服钱，账上好看点。" });
                    break;
                case 3:
                    list.Add(new Choice { label = "照本念一遍", cost = 1, grudge = -3, flavor = "念完就算，不多说一个字。" });
                    list.Add(new Choice { label = "问一句：还能不能更好一点", cost = 1, grudge = -8, rep = { { "street", 2 } }, flavor = "这句话不是念给人听的。", needRep = 55 });
                    list.Add(new Choice { label = "不念，省时间", cost = 0, grudge = 8, rep = { { "street", -1 } }, flavor = "没时间念辞，下一家还等着。" });
                    break;
                case 4:
                    list.Add(new Choice { label = "准点出", cost = 1, grudge = -3, rep = { { "official", 1 } }, flavor = "时辰正好，一路没出岔子。" });
                    list.Add(new Choice { label = "加钱加排场", cost = 2, grudge = -6, money = -400, rep = { { "street", 2 }, { "trade", 1 } }, flavor = "排场给足，来的都点头。" });
                    list.Add(new Choice { label = "草草抬走", cost = 0, grudge = 7, money = 60, rep = { { "official", -1 } }, flavor = "抬得急，看门的大爷直皱眉。" });
                    break;
            }
            return list;
        }

        public bool CanAfford(Choice o) => hours >= o.cost;

        public bool CanChoose(Choice o)
        {
            if (o.needRep > 0 && repStreet < o.needRep && repTrade < o.needRep) return false;
            return true;
        }

        public bool StartCase(int idx)
        {
            if (active != null || hours < 1) return false;
            active = DrawCase(idx);
            activeStage = 0;
            hours -= 1;
            Log($"接单：{active.name}（{active.cause}）");
            return true;
        }

        public class ChooseResult
        {
            public bool ok, done;
            public string text = "";
            public int earned, grudge;
            public bool haunt;
        }

        public string Hire(string kind)
        {
            int cost = kind == "徒弟" ? Mgmt.ApprenticeCost : kind == "化妆师" ? Mgmt.MakeupCost : Mgmt.EmceeCost;
            if (kind == "徒弟" && hiredApprentice || kind == "化妆师" && hiredMakeup || kind == "司仪" && hiredEmcee)
                return "今天已经雇过" + kind + "了。";
            if (money < cost) return $"钱不够，{kind}要 ¥{cost}。";

            money -= cost;
            if (kind == "徒弟") { hiredApprentice = true; hours += 1; mgmtNote = "徒弟到了，今天多一格时辰。"; }
            else if (kind == "化妆师") { hiredMakeup = true; mgmtNote = "化妆师到了，这一天的单子好看些。"; }
            else { hiredEmcee = true; mgmtNote = "司仪到了，收尸时不那么冷。"; }
            return mgmtNote;
        }

        public string BuySupplies(string kind)
        {
            if (kind == "香烛")
            {
                if (money < Mgmt.IncenseCost) return $"钱不够，香烛要 ¥{Mgmt.IncenseCost}。";
                money -= Mgmt.IncenseCost; incense += 1;
                return "添了一份香烛。";
            }
            if (money < Mgmt.ClothCost) return $"钱不够，寿衣料要 ¥{Mgmt.ClothCost}。";
            money -= Mgmt.ClothCost; cloth += 1;
            return "添了一份寿衣料。";
        }

        public string Bribe()
        {
            if (money < Mgmt.BribeCost) return $"钱不够，打点要 ¥{Mgmt.BribeCost}。";
            money -= Mgmt.BribeCost;
            officialHeat = Mathf.Clamp(officialHeat - 15, 0, 100);
            return "该给的给了，热度松了些。";
        }

        public ChooseResult Choose(int idx)
        {
            var r = new ChooseResult();
            if (active == null) { r.text = "手上没单。"; return r; }
            var opts = ChoicesFor(activeStage);
            if (idx < 0 || idx >= opts.Count) { r.text = "没有这个干法。"; return r; }
            var o = opts[idx];
            if (!CanAfford(o)) { r.text = "时辰不够了。"; return r; }
            if (!CanChoose(o)) { r.text = "这句话现在说不出口。"; return r; }

            int costNow = o.cost;
            if (activeStage == 2 && costNow > 0 && cloth > 0) { cloth -= 1; costNow = 0; mgmtNote = "用了自己备的寿衣料，这道不占时辰。"; }
            if (activeStage == 0 && incense > 0) { incense -= 1; active.grudgeNow = Mathf.Clamp(active.grudgeNow - 2, 0, 100); }
            hours -= costNow;
            active.grudgeNow = Mathf.Clamp(active.grudgeNow + o.grudge, 0, 100);
            money += o.money;
            foreach (var kv in o.rep) AddRep(kv.Key, kv.Value);
            if (o.special) { tribute += 1; Log("从尸体上刮了点东西，上供 +1"); }

            r.text = Stages[Mathf.Clamp(activeStage, 0, Stages.Length - 1)] + "：" + o.flavor;
            Log(r.text);

            activeStage += 1;
            if (activeStage >= Stages.Length) return Settle();
            r.ok = true;
            return r;
        }

        ChooseResult Settle()
        {
            var c = active;
            int earned = c.worth * (100 - c.grudgeNow) / 100;
            if (hiredMakeup) earned = earned * 110 / 100;
            money += earned;
            casesDone += 1;
            Log($"结账：{c.name} 收 {earned}");

            var res = new ChooseResult { ok = true, done = true, earned = earned, grudge = c.grudgeNow };
            if (c.grudgeNow >= 85)
            {
                res.haunt = true;
                repOfficial = Mathf.Clamp(repOfficial - 8, 0, 100);
                repStreet = Mathf.Clamp(repStreet - 5, 0, 100);
                Log("出事了：尸身不安生，闹了一夜。");
                res.text = $"夜里尸身不安生，闹了一场。官方来问过话。（结算 ¥{earned}，官方 -8，街坊 -5）";
            }
            else res.text = $"这一单办完了。进账 ¥{earned}。";
            if (c.special) res.text += "（这单没人给钱，但上面的记下了。）";

            week.Add(new Dictionary<string, int> { { "day", day }, { "earned", earned }, { "cases", casesDone } });
            active = null;
            activeStage = 0;
            return res;
        }

        public string EndDay()
        {
            var decay = RepDecay();
            var press = RivalPressure();
            int heatDelta = 1;
            if (week.Count > 0 && week[week.Count - 1]["earned"] >= 80) heatDelta += 1;
            if (repOfficial >= 70) heatDelta -= 1;
            officialHeat = Mathf.Clamp(officialHeat + heatDelta, 0, 100);

            var sb = new System.Text.StringBuilder();
            sb.AppendLine($"第 {day} 日打烊。钱 ¥{money}，时辰剩 {hours}。");
            if (decay.Count > 0) sb.AppendLine("人情淡了一点：" + string.Join("，", decay));
            if (press.Count > 0) sb.AppendLine(string.Join(" ", press));
            sb.AppendLine($"官面：{OfficialStage()}（热度 {officialHeat}）");
            sb.AppendLine(DailyEvent());

            hiredApprentice = hiredMakeup = hiredEmcee = false;
            day += 1;
            hours = 6;
            return sb.ToString();
        }

        List<string> RepDecay()
        {
            var notes = new List<string>();
            foreach (var k in new[] { "street", "trade", "official" })
            {
                int v = Rep(k);
                if (v > 50)
                {
                    int lose = v < 70 ? 1 : 2;
                    AddRep(k, -lose);
                    notes.Add(KindName(k) + " -" + lose);
                }
            }
            return notes;
        }

        List<string> RivalPressure()
        {
            string leader = ""; int top = -1;
            string laggard = ""; int low = 999;
            foreach (var kv in rivals)
            {
                if (kv.Value > top) { top = kv.Value; leader = kv.Key; }
                if (kv.Value < low) { low = kv.Value; laggard = kv.Key; }
            }

            int today = week.Count > 0 ? week[week.Count - 1]["earned"] : 0;
            var notes = new List<string>();
            if (today >= 60)
            {
                AddRep("trade", -1);
                notes.Add("同业有人议价：这一带的价被你压了。");
            }

            var keys = new List<string>(rivals.Keys);
            foreach (var name in keys)
            {
                int step = 1;
                if (name == laggard) step = 3;
                if (name == leader && top >= 80) step = 0;
                rivals[name] = Mathf.Clamp(rivals[name] + step, 0, 100);
            }

            if (top - low >= 10) notes.Add($"掉队的是{laggard}，{leader}还在前头。");
            return notes;
        }

        static readonly string[] Events =
        {
            "隔壁街又开了一家白事铺，门口摆着花圈，价钱比你低三成。",
            "居委会来人问了一句：最近怎么这么多没名的单子。",
            "同业里有人把你的价目表抄走，第二天就挂在自己墙上。",
            "殡仪馆后墙渗水，靠墙那排骨灰盒挪了两格。",
            "有个老主顾带孙子来，说以后也交给你办。",
        };

        public string DailyEvent()
        {
            var e = Events[Rng.Next(0, Events.Length)];
            if (e.StartsWith("居委会")) officialHeat = Mathf.Clamp(officialHeat + 2, 0, 100);
            return "夜里：" + e;
        }

        public string OfficialStage()
        {
            if (officialHeat < 15) return "没人管你";
            if (officialHeat < 35) return "有人来问过一句";
            if (officialHeat < 60) return "有人上门看账";
            return "他们开始记你的名字";
        }

        public string KindName(string k)
        {
            switch (k)
            {
                case "street": return "街坊";
                case "trade": return "同业";
                case "official": return "官方";
            }
            return k;
        }

        public bool CasinoReady => tribute >= 3 && !demoDone;

        public string AcceptDeal()
        {
            demoDone = true;
            return "未型在赌场门口等你。他说：殡仪馆的账，赌场愿意帮着平。"
                 + "你以后在赌场做托，客人赢，你抽两成；客人输，账记在殡仪馆头上。"
                 + "（demo 到这里为止。剩下的路，等你想好了再开。）";
        }

        // ── 赌场 ───────────────────────────────────────────────
        public class DiceResult
        {
            public bool ok; public string text = "";
            public int[] dice = new int[3]; public int total; public bool hit, triple;
        }

        public DiceResult CasinoBet(int bet, string pick, string style)
        {
            var r = new DiceResult();
            if (hours < 1) { r.text = "没时辰了，明天再上桌。"; return r; }
            if (money < bet) { r.text = "钱不够下注。"; return r; }

            hours -= 1;
            money -= bet;

            var d = new[] { Rng.Next(1, 7), Rng.Next(1, 7), Rng.Next(1, 7) };
            lastDice = d;
            int total = d[0] + d[1] + d[2];
            bool triple = d[0] == d[1] && d[1] == d[2];
            bool big = total >= 11;

            string myPick = pick;
            if (style == "water") myPick = Rng.Next(0, 2) == 0 ? "big" : "small";

            bool hit = !triple && (big == (myPick == "big"));
            r.dice = d; r.total = total; r.triple = triple; r.hit = hit; r.ok = true;

            if (hit)
            {
                int gain = bet * 2;
                money += gain;
                r.text = $"开 {total} 点，{(big ? "大" : "小")}。押中，进 ¥{gain}。";
                AddRep("trade", 1);
            }
            else if (style == "water")
            {
                if (triple)
                {
                    r.text = $"开 {total} 点，三同通杀。两边都没了，赌场不认账。";
                    AddRep("trade", -1);
                }
                else
                {
                    int fee = Mathf.RoundToInt(bet * 0.6f);
                    money += fee;
                    AddRep("street", 1);
                    r.text = $"开 {total} 点，{(big ? "大" : "小")}。客人押{(big ? "小" : "大")}，赢了。赌场抽你 ¥{fee}。";
                }
            }
            else
            {
                r.text = $"开 {total} 点{(triple ? "，三同通杀" : (big ? "，大" : "，小"))}。输了 ¥{bet}。";
                AddRep("trade", -1);
            }

            casinoGames += 1;
            Log(r.text);
            return r;
        }

        // ── 大学 ───────────────────────────────────────────────
        public string UniLesson()
        {
            if (hours <= 0) return "今天没工夫了。";
            hours -= 1;
            repTrade = Mathf.Clamp(repTrade + 3, 0, 100);
            Log("去阶梯教室听了一堂课。");
            return "讲台上讲：「丧礼是给活人办的。」同业高看你三分。";
        }

        public string UniArchive()
        {
            if (hours <= 0) return "今天没工夫了。";
            if (money < 60) return "查档要交六十块复印费，你掏不出来。";
            hours -= 1;
            money -= 60;
            officialHeat = Mathf.Max(0, officialHeat - 2);
            repOfficial = Mathf.Clamp(repOfficial + 2, 0, 100);
            Log("翻了半天旧档，把规矩看明白一点。");
            return "旧档里写着三十年前同样的纠纷，怎么判的、谁签的字。官面那边松了一点。";
        }

        public string UniHire()
        {
            if (money < 150) return "雇一个学生要一百五，你掏不出来。";
            if (hours >= 8) return "今天已经排满了。";
            money -= 150;
            hours += 1;
            Log("花一百五雇了个学生搭手。");
            return "一个学民俗的学生来搭手，今天能多办一点。";
        }


        // ── 书店 ───────────────────────────────────────────────
        public string BookBuy()
        {
            if (money < 120) return "店里那本《丧仪备要》要一百二，你掏不出来。";
            money -= 120;
            repStreet = Mathf.Clamp(repStreet + 3, 0, 100);
            Log("买了一本《丧仪备要》，翻两页就知道哪些话能说。");
            return "买下一本《丧仪备要》。纸是新的，印得很糙，但规矩写得清楚。街坊会觉得你懂行。";
        }

        public string BookRead()
        {
            if (hours <= 0) return "今天没工夫了。";
            hours -= 1;
            repTrade = Mathf.Clamp(repTrade + 1, 0, 100);
            Log("在书架后面站了一个时辰，把别人的笔记抄了几页。");
            return "书架后面站着翻完了半本手抄的账册。同业的路数，你看明白了一点。";
        }

        // ── 存档 ───────────────────────────────────────────────
        public string ToJson()
        {
            var o = new System.Collections.Generic.Dictionary<string, object>
            {
                { "day", day }, { "hours", hours }, { "money", money },
                { "street", repStreet }, { "trade", repTrade }, { "official", repOfficial },
                { "cases", casesDone }, { "tribute", tribute }, { "heat", officialHeat },
                { "demo", demoDone }
            };
            return JsonUtility.ToJson(new SaveBlob
            {
                day = day, hours = hours, money = money,
                street = repStreet, trade = repTrade, official = repOfficial,
                cases = casesDone, tribute = tribute, heat = officialHeat, demo = demoDone,
                playerName = playerName, playerGender = playerGender
            });
        }

        [System.Serializable]
        public class SaveBlob
        {
            public int day, hours, money, street, trade, official, cases, tribute, heat;
            public bool demo;
            public string playerName;
            public int playerGender;
        }

        public bool LoadJson(string json)
        {
            if (string.IsNullOrEmpty(json)) return false;
            var b = JsonUtility.FromJson<SaveBlob>(json);
            if (b == null || b.day < 1) return false;
            day = b.day; hours = b.hours; money = b.money;
            repStreet = b.street; repTrade = b.trade; repOfficial = b.official;
            casesDone = b.cases; tribute = b.tribute; officialHeat = b.heat; demoDone = b.demo;
            if (!string.IsNullOrEmpty(b.playerName)) playerName = b.playerName;
            playerGender = Mathf.Clamp(b.playerGender, 0, 1);
            active = null; activeStage = 0;
            return true;
        }

        public int CurrentSlot = 0;
        public const int SlotCount = 99;

        public static string SavePath => Application.persistentDataPath + "/yueliangxiang.save.json";
        public static string SlotPath(int i) => Application.persistentDataPath + "/yueliangxiang.save.slot" + i + ".json";

        /// 给档位界面用：返回「第 N 天 · ¥M」或空字符串表示空档
        public static string SlotSummary(int i)
        {
            try
            {
                string pth = SlotPath(i);
                if (!System.IO.File.Exists(pth)) return "";
                var b = JsonUtility.FromJson<SaveBlob>(System.IO.File.ReadAllText(pth));
                if (b == null || b.day < 1) return "";
                return "第 " + b.day + " 天 · ¥" + b.money;
            }
            catch { return ""; }
        }

        public string Save()
        {
            try
            {
                System.IO.File.WriteAllText(SlotPath(CurrentSlot), ToJson());
                Log("存档了。");
                return "已存档。" + SavePath;
            }
            catch (System.Exception e) { return "存档失败：" + e.Message; }
        }

        public string Load()
        {
            try
            {
                string pth = SlotPath(CurrentSlot);
                if (!System.IO.File.Exists(pth)) return "这个档位还是空的。";
                return LoadJson(System.IO.File.ReadAllText(pth)) ? "读到第 " + day + " 天。" : "存档读不出来。";
            }
            catch (System.Exception e) { return "读档失败：" + e.Message; }
        }

        void Log(string s)
        {
            log.Add(s);
            while (log.Count > 30) log.RemoveAt(0);
        }
    }
}
