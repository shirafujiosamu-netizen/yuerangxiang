using System;
using System.Collections.Generic;

namespace Yueliangxiang
{
    // 全部内容都是卡：道具 / 物资 / 武器 / 人物 / 技能 / 任务 / BUFF / DEBUFF
    // 以及主线剧情节点、遭遇战、技能树加点产出的成长卡。
    // UI 只用 DrawCard 的 kind 与 tag 区分，不给任何一类单独做面板。
    public enum CardKind
    {
        Item, Supply, Weapon, Person, Skill, Spell, Ritual, Vehicle,
        Quest, Clue, Growth, Buff, Debuff, Encounter, Story, Stage
    }

    // 科技树四类：工程 / 创智 / 艺能 / 人体（见《卡牌属性》第 26 页）
    public enum School { None, Engineering, Lore, Art, Body }

    // 需求资源：移动值 / 体力 / 理智(san) / 魔法 / 物品 / 财产
    public enum Resource { Move, Body, Sanity, Magic, Item, Property }

    // 占用：不产生花费；消耗：产生花费
    public enum CostMode { Occupy, Consume }

    // 物理 / 法术 / 精神
    public enum DamageType { None, Physical, Magic, Mental }

    [Serializable]
    public class CardCost
    {
        public Resource resource;
        public CostMode mode;
        public int value;

        public CardCost() { }
        public CardCost(Resource r, CostMode m, int v) { resource = r; mode = m; value = v; }

        public string Text
        {
            get
            {
                return (mode == CostMode.Occupy ? "占用" : "消耗") + ResourceName(resource) + value;
            }
        }

        public static string ResourceName(Resource r)
        {
            switch (r)
            {
                case Resource.Move: return "移动值";
                case Resource.Body: return "体力";
                case Resource.Sanity: return "理智";
                case Resource.Magic: return "魔法";
                case Resource.Item: return "物品";
                case Resource.Property: return "财产";
            }
            return "";
        }
    }

    [Serializable]
    public class CardDef
    {
        public string id;
        public string title;
        public string body;
        public CardKind kind;
        public School school;
        public int star = 1;                 // 星级 1-5
        public int dice = 4;                 // 判定骰面数：4/6/8/10/12/20
        public DamageType damage = DamageType.None;
        public int damageValue;
        public List<CardCost> costs = new List<CardCost>();
        public string effect;                // 规则层读的效果标识
        public string combo;                 // 特殊连携 / 被动效果
        public string synth;                 // 合成类别：武器 / 技艺 / 体术 / 法术 / 仪式
        public bool vehicle;                 // 是否载具卡（战斗前加入本场卡组）
        public bool nonHuman;                // 非人单位：敌方回合结算一次 san

        public string KindText
        {
            get
            {
                switch (kind)
                {
                    case CardKind.Item: return "道具";
                    case CardKind.Supply: return "物资";
                    case CardKind.Weapon: return "武器";
                    case CardKind.Person: return "人物";
                    case CardKind.Skill: return "技能";
                    case CardKind.Spell: return "法术";
                    case CardKind.Ritual: return "仪式";
                    case CardKind.Vehicle: return "载具";
                    case CardKind.Quest: return "任务";
                    case CardKind.Clue: return "线索";
                    case CardKind.Growth: return "成长";
                    case CardKind.Buff: return "增益";
                    case CardKind.Debuff: return "减益";
                    case CardKind.Encounter: return "遭遇";
                    case CardKind.Story: return "剧情";
                    case CardKind.Stage: return "工序";
                }
                return "";
            }
        }

        public static string SchoolName(School s)
        {
            switch (s)
            {
                case School.Engineering: return "工程";
                case School.Lore: return "创智";
                case School.Art: return "艺能";
                case School.Body: return "人体";
            }
            return "";
        }

        // DrawCard 的 tag：分类 + 星级 + 需求，一眼能读出这张卡的规则位置
        public string TagText
        {
            get
            {
                string s = SchoolName(school);
                if (string.IsNullOrEmpty(s)) s = synth;
                if (string.IsNullOrEmpty(s)) s = "通用";
                string t = s + " · " + star + "★";
                if (costs.Count > 0) t += " · " + costs[0].Text;
                return t;
            }
        }
    }

    public class Card
    {
        public CardDef def;
        public int uid;
        public bool exhausted;
        public bool faceDown;

        public Card(CardDef d, int id) { def = d; uid = id; }
    }

    // 手牌式容器：背包 / 任务栏 / 人物栏 / 手牌 / 牌库 / 弃牌 都是同一个东西，
    // 只是落在不同 Zone；UI 一律按手牌横排绘制。
    public enum Zone { Deck, Hand, Bag, Quest, Person, Character, Order, Discard }

    public class CardPile
    {
        public Zone zone;
        public readonly List<Card> cards = new List<Card>();

        public CardPile(Zone z) { zone = z; }

        public string Name
        {
            get
            {
                switch (zone)
                {
                    case Zone.Deck: return "卡组";
                    case Zone.Hand: return "手牌";
                    case Zone.Bag: return "背包";
                    case Zone.Quest: return "任务栏";
                    case Zone.Person: return "人物栏";
                    case Zone.Character: return "角色位";
                    case Zone.Order: return "接单区";
                    case Zone.Discard: return "丢弃区";
                }
                return "";
            }
        }

        public void Add(CardDef d, int uid) { cards.Add(new Card(d, uid)); }

        public bool MoveTo(Card c, CardPile target)
        {
            if (!cards.Remove(c)) return false;
            target.cards.Add(c);
            return true;
        }
    }

    // 卡组：流程图的 8 组预装卡组，每组至多 22 张且不重复
    public class CardDeck
    {
        public const int MaxSize = 22;
        public string name;
        public readonly List<CardDef> list = new List<CardDef>();

        public CardDeck(string n) { name = n; }

        public bool Add(CardDef d)
        {
            if (list.Count >= MaxSize) return false;
            foreach (var x in list) if (x.id == d.id) return false;
            list.Add(d);
            return true;
        }
    }

    // 技能树节点：加点只改数值不产卡；除数值以外的成长一律发一张 Growth 卡
    [Serializable]
    public class SkillNode
    {
        public string id;
        public string title;
        public School school;
        public int tier;
        public int level;
        public int numericBonus;             // 纯数值成长（体力/魔法/移动值/穿透/爆伤）
        public string numericNote;
        public CardDef grantCard;            // 非数值成长：新卡 / 新效果 / 新连携
        public List<string> requires = new List<string>();

        public bool Taken { get { return level > 0; } }
    }

    public class SkillTree
    {
        public readonly List<SkillNode> nodes = new List<SkillNode>();
        readonly List<Card> _granted = new List<Card>();
        int _uid = 1;

        // 返回本次加点新拿到的卡（可能为空：这一级只加数值）
        public Card Take(SkillNode n)
        {
            if (n == null) return null;
            n.level++;
            if (n.grantCard == null) return null;
            var c = new Card(n.grantCard, _uid++);
            _granted.Add(c);
            return c;
        }

        public IList<Card> Granted { get { return _granted; } }
    }

    // COC 式主线：剧情节点串起来，节点可以带线索、检定和遭遇战；
    // 遭遇战复用同一套卡组与出牌流程，不另做战斗界面。
    [Serializable]
    public class StoryNode
    {
        public string id;
        public string title;
        public string text;
        public string checkSkill;            // 检定用的技能卡 id
        public int difficulty;               // 骰子 >=5 判定，难度调整骰面数
        public string nextOnSuccess;
        public string nextOnFail;
        public string encounterId;           // 非空则进入遭遇战
        public List<string> clueIds = new List<string>();
    }

    [Serializable]
    public class Encounter
    {
        public string id;
        public string title;
        public string text;
        public string enemyDeck;             // 敌方卡组名
        public bool nonHuman;                // 非人单位：敌方回合结算 san
        public string rewardCardId;
        public string nextNodeId;
    }

    public class Campaign
    {
        public readonly Dictionary<string, StoryNode> nodes = new Dictionary<string, StoryNode>();
        public readonly Dictionary<string, Encounter> encounters = new Dictionary<string, Encounter>();
        public string currentId;
        public readonly List<string> clues = new List<string>();

        public StoryNode Current
        {
            get
            {
                StoryNode n;
                return currentId != null && nodes.TryGetValue(currentId, out n) ? n : null;
            }
        }

        public void Advance(bool success)
        {
            var n = Current;
            if (n == null) return;
            currentId = success ? n.nextOnSuccess : n.nextOnFail;
        }

        public static int Roll(int faces, int bonus, System.Random rng)
        {
            if (faces < 4) faces = 4;
            return rng.Next(1, faces + 1) + bonus;   // >=5 命中 / 暴击
        }
    }

    // 静态卡表：从《卡牌属性》抽代表条目，覆盖武器 / 技艺 / 体术 / 法术 / 仪式 /
    // 典籍 / 载具 / 人物 / 任务 / 成长 / 遭遇，供卡桌直接排成手牌。
    public static class CardCatalog
    {
        static readonly List<CardDef> All = new List<CardDef>();
        static readonly Dictionary<string, CardDef> ById = new Dictionary<string, CardDef>();
        static readonly string NL = ((char)10).ToString();

        static CardDef Make(string id, string title, CardKind kind, School school, int star,
                            string body, string effect = "", string synth = "")
        {
            var d = new CardDef
            {
                id = id, title = title, kind = kind, school = school, star = star,
                body = body, effect = effect, synth = synth
            };
            All.Add(d);
            ById[id] = d;
            return d;
        }

        static void Cost(CardDef d, Resource r, CostMode m, int v)
        {
            d.costs.Add(new CardCost(r, m, v));
        }

        static CardCatalog()
        {
            // 武器 · 工程
            var fist = Make("w_fist", "拳头", CardKind.Weapon, School.Engineering, 1,
                "占用1点体力，对所选单个敌方单位造成1点物理伤害", "phys:1", "武器");
            Cost(fist, Resource.Body, CostMode.Occupy, 1);
            fist.damage = DamageType.Physical; fist.damageValue = 1;

            var saw = Make("w_saw", "电锯", CardKind.Weapon, School.Engineering, 3,
                "占用4点体力，对所选两个敌方单位造成4点物理伤害", "phys:4x2", "武器");
            Cost(saw, Resource.Body, CostMode.Occupy, 4);
            saw.damage = DamageType.Physical; saw.damageValue = 4;

            var axe = Make("w_axe", "手斧／镰刀", CardKind.Weapon, School.Engineering, 3,
                "占用3点体力，对单个目标造成3点物理伤害，每回合1点流血持续两回合", "bleed:1x2", "武器");
            Cost(axe, Resource.Body, CostMode.Occupy, 3);

            var wire = Make("w_wire", "220v通电导线", CardKind.Weapon, School.Engineering, 3,
                "占用5点体力，消耗这根导线，对单个目标造成5点物理伤害", "consume_self", "武器");
            Cost(wire, Resource.Body, CostMode.Occupy, 5);
            Cost(wire, Resource.Item, CostMode.Consume, 1);

            var pistol = Make("w_pistol", ".22小型自动手枪", CardKind.Weapon, School.Engineering, 2,
                "占用2点体力，消耗一发5.6mm子弹，造成2点物理伤害", "ammo:5.6mm", "武器");
            Cost(pistol, Resource.Body, CostMode.Occupy, 2);

            var corpse = Make("w_corpse", "尸体", CardKind.Weapon, School.Engineering, 4,
                "占用6点体力，消耗一具尸体，造成6点物理伤害", "consume_self", "武器");
            Cost(corpse, Resource.Body, CostMode.Occupy, 6);

            // 技艺 / 体术 / 法术 / 仪式
            var shooting = Make("s_shoot", "射击", CardKind.Skill, School.Art, 1,
                "占用1点体力、2点理智，增加2点精准", "acc:+2", "技艺");
            Cost(shooting, Resource.Body, CostMode.Occupy, 1);
            Cost(shooting, Resource.Sanity, CostMode.Occupy, 2);

            var dodge = Make("s_dodge", "闪避", CardKind.Skill, School.Art, 1,
                "占用1点体力，下一回合增加2点闪避", "eva:+2", "体术");
            Cost(dodge, Resource.Body, CostMode.Occupy, 1);

            var firstaid = Make("s_firstaid", "急救", CardKind.Skill, School.Body, 2,
                "占用2点体力，回复损失体力的一半，下一回合增加4点闪避", "heal:half", "体术");
            Cost(firstaid, Resource.Body, CostMode.Occupy, 2);

            var sneak = Make("s_sneak", "潜行", CardKind.Skill, School.Body, 2,
                "占用2点移动值，增加3点闪避，持续两回合", "eva:+3", "体术");
            Cost(sneak, Resource.Move, CostMode.Consume, 2);

            var mythos = Make("s_mythos", "旧籍辨读", CardKind.Skill, School.Lore, 5,
                "占用2点移动值、2点理智；理智越低，检定越容易失手", "check:san", "技艺");
            Cost(mythos, Resource.Move, CostMode.Occupy, 2);
            Cost(mythos, Resource.Sanity, CostMode.Occupy, 2);
            mythos.dice = 20;

            var necro = Make("b_necro", "死灵之书①", CardKind.Spell, School.Lore, 4,
                "消耗3点理智、占用5点魔法，触碰那些不愿被读出来的东西", "contact", "法术");
            Cost(necro, Resource.Sanity, CostMode.Consume, 3);
            Cost(necro, Resource.Magic, CostMode.Occupy, 5);

            var ritual = Make("r_glaaki", "格拉基启示录（一）", CardKind.Ritual, School.Lore, 4,
                "使选中目标下一回合的任意行动维持消耗但不产生效果", "nullify", "仪式");
            Cost(ritual, Resource.Move, CostMode.Occupy, 4);
            ritual.combo = "使用后打出的每张创智卡额外造成3点法术伤害";

            // 物资 / 道具 / 载具 / 人物
            Make("m_incense", "香烛", CardKind.Supply, School.None, 1, "消耗品：一次工序用掉一支");
            Make("m_cloth", "寿衣料", CardKind.Supply, School.None, 1, "消耗品：穿衣工序用掉一匹");
            Make("i_torch", "燃烧的火把", CardKind.Item, School.Engineering, 1, "照明；也可临时当武器");
            Make("i_brass", "黄铜指虎", CardKind.Item, School.Engineering, 1, "占用1点体力，造成1点物理伤害");

            var car = Make("v_car", "车", CardKind.Vehicle, School.Engineering, 2,
                "战斗前加入本场卡组；你把车开到了对方脸上：造成对应物理伤害", "vehicle", "武器");
            car.vehicle = true;
            Cost(car, Resource.Move, CostMode.Occupy, 3);

            Make("p_eidos", "艾多斯", CardKind.Person, School.None, 3, "可邀请的女主；确认同伴连携效果");
            Make("p_apprentice", "徒弟", CardKind.Person, School.None, 1, "当日雇工；占用一个角色位");

            // 任务 / 线索 / 增益 / 减益 / 工序
            Make("q_case", "案卷", CardKind.Quest, School.None, 1, "拖到接单区接单");
            Make("c_needle", "别人缝的针脚", CardKind.Clue, School.Lore, 1, "线索：指向一段没写完的记录");
            Make("c_note", "没干的胶", CardKind.Clue, School.Lore, 1, "线索：这封信是当着你的面放下的");
            Make("c_page", "多出来的一页", CardKind.Clue, School.Lore, 1, "线索：案卷池里那一页，字是新的");
            Make("u_wet", "潮湿", CardKind.Debuff, School.None, 1,
                "全体人员减少2点物理攻击和5点护甲");
            Make("u_brave", "深呼吸", CardKind.Buff, School.Body, 1,
                "占用1点体力；下一回合增加2点闪避");
            Make("g_stage", "工序", CardKind.Stage, School.None, 1, "点一下推进当前那道");

            // 技能树非数值成长：加点发卡，不直接改数值
            Make("w_growth_eng", "穿透改锥", CardKind.Growth, School.Engineering, 2,
                "工程树：物理穿透 +1，附带一张成长卡");
            Make("w_growth_lore", "抄本残页", CardKind.Growth, School.Lore, 3,
                "创智树：解锁一张法术卡与一段特殊连携");
            Make("w_growth_art", "旧印拓片", CardKind.Growth, School.Art, 2,
                "艺能树：解锁一张仪式卡");
            Make("w_growth_body", "深呼吸·续", CardKind.Growth, School.Body, 2,
                "人体树：体力上限 +1，附带一张成长卡");

            // 主线剧情 / 遭遇战
            Make("e_door", "完人之门", CardKind.Encounter, School.None, 3,
                "遭遇战：门后有人替你先走了一步");
            Make("e_backroom", "后堂", CardKind.Encounter, School.Lore, 2,
                "遭遇战：案卷池里多出来的一页");
            Make("n_letter", "一封没署名的信", CardKind.Story, School.None, 1,
                "剧情节点：走剧情、做检定、拿线索");
        }

        public static CardDef Get(string id)
        {
            CardDef d;
            return ById.TryGetValue(id, out d) ? d : null;
        }

        public static IList<CardDef> AllCards { get { return All; } }

        public static IList<CardDef> Of(CardKind k)
        {
            var r = new List<CardDef>();
            foreach (var d in All) if (d.kind == k) r.Add(d);
            return r;
        }

        // 流程图的 8 组预装卡组：每组至多 22 张、不重复
        public static List<CardDeck> PresetDecks()
        {
            var names = new[] { "收殓", "街坊", "夜巡", "旧教", "病历", "账本", "工坊", "白模" };
            var decks = new List<CardDeck>();
            string[] anchors =
            {
                "w_fist", "s_shoot", "s_sneak", "s_mythos", "s_firstaid",
                "i_torch", "w_axe", "b_necro"
            };
            for (int i = 0; i < names.Length; i++)
            {
                var d = new CardDeck(names[i]);
                d.Add(Get(anchors[i]));
                foreach (var w in Of(CardKind.Weapon)) d.Add(w);
                foreach (var s in Of(CardKind.Skill)) d.Add(s);
                foreach (var m in Of(CardKind.Supply)) d.Add(m);
                foreach (var it in Of(CardKind.Item)) d.Add(it);
                d.Add(Get("p_eidos"));
                decks.Add(d);
            }
            return decks;
        }

        // 技能树：四类各一条，除数值以外的成长发卡
        public static SkillTree Tree()
        {
            var t = new SkillTree();
            t.nodes.Add(new SkillNode
            {
                id = "eng_1", title = "工程·穿透", school = School.Engineering, tier = 1,
                numericBonus = 1, numericNote = "物理穿透 +1",
                grantCard = Get("w_growth_eng")
            });
            t.nodes.Add(new SkillNode
            {
                id = "lore_1", title = "创智·抄本", school = School.Lore, tier = 1,
                numericBonus = 2, numericNote = "魔法上限 +2",
                grantCard = Get("w_growth_lore")
            });
            t.nodes.Add(new SkillNode
            {
                id = "art_1", title = "艺能·旧印", school = School.Art, tier = 1,
                numericBonus = 0, numericNote = "骰面 4 → 6",
                grantCard = Get("w_growth_art")
            });
            t.nodes.Add(new SkillNode
            {
                id = "body_1", title = "人体·气息", school = School.Body, tier = 1,
                numericBonus = 1, numericNote = "体力上限 +1",
                grantCard = Get("w_growth_body")
            });
            return t;
        }

        // 一条最短可玩主线：剧情 → 检定 → 遭遇 → 线索 → 下一节点
        public static Campaign Story()
        {
            var c = new Campaign();
            c.nodes["n_letter"] = new StoryNode
            {
                id = "n_letter", title = "一封没署名的信",
                text = "柜台上多了一封信，封口是新的，纸是旧的。",
                checkSkill = "s_mythos", difficulty = 5,
                nextOnSuccess = "n_backroom", nextOnFail = "n_doubt",
                clueIds = new List<string> { "c_needle" }
            };
            c.nodes["n_backroom"] = new StoryNode
            {
                id = "n_backroom", title = "后堂",
                text = "灯没开，案卷池里多出来一页。",
                checkSkill = "s_sneak", difficulty = 5,
                encounterId = "e_backroom",
                nextOnSuccess = "n_door", nextOnFail = "n_door",
                clueIds = new List<string> { "c_page" }
            };
            c.nodes["n_door"] = new StoryNode
            {
                id = "n_door", title = "完人之门",
                text = "门后有人替你先走了一步。",
                checkSkill = "s_shoot", difficulty = 5,
                encounterId = "e_door",
                nextOnSuccess = "n_end", nextOnFail = "n_end"
            };
            c.nodes["n_doubt"] = new StoryNode
            {
                id = "n_doubt", title = "封口是新的",
                text = "你摸到封口上的胶还没干。谁刚刚把它放下？",
                checkSkill = "s_sneak", difficulty = 5,
                nextOnSuccess = "n_backroom", nextOnFail = "n_backroom",
                clueIds = new List<string> { "c_note" }
            };
            c.nodes["n_end"] = new StoryNode
            {
                id = "n_end", title = "台前",
                text = "门合上了。柜台上还是四份单子，你把它压在最下面。",
                checkSkill = "", difficulty = 0
            };
            c.encounters["e_backroom"] = new Encounter
            {
                id = "e_backroom", title = "后堂",
                text = "一页纸自己翻了过来。", enemyDeck = "旧教",
                rewardCardId = "b_necro", nextNodeId = "n_door"
            };
            c.encounters["e_door"] = new Encounter
            {
                id = "e_door", title = "完人之门",
                text = "它不是人。敌方回合结束时，结算一次理智。", enemyDeck = "白模",
                nonHuman = true, rewardCardId = "r_glaaki"
            };
            c.currentId = "n_letter";
            return c;
        }
    }
}
