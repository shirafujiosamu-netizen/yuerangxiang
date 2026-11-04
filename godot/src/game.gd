class_name GameState
extends RefCounted
## 黄昏之门 · 纯逻辑层（不碰 3D / UI，headless 可测）
## 一单 = 一条案卷；五道工序 = 收尸/洗身/穿衣/念辞/出殡；
## 每道工序选一种干法，改动案卷的「怨气」和三类口碑；结算折成钱。
## 资源：钱（现金）、口碑（街坊/同业/官方三群）、时辰（今天几格）。

# 危险等级 ← 死因。脑叶的 ZAYIN/TETH/HE/WAW/ALEPH，这里改成丧葬口径。
const RISK := {
	"寿终": {"name": "安", "base": 0},
	"病故": {"name": "稳", "base": 10},
	"横死": {"name": "凶", "base": 35},
	"怨死": {"name": "厉", "base": 60},
	"奇死": {"name": "邪", "base": 85},
}

const STAGES := ["收尸", "洗身", "穿衣", "念辞", "出殡"]

var day: int = 1
var hours: int = 6            # 今天剩几格
var money: int = 0
var rep_street: int = 50      # 街坊
var rep_trade: int = 50       # 同业
var rep_official: int = 50    # 官方
var cases_done: int = 0
var log: Array = []           # 最近若干条账目
var active: Dictionary = {}   # 正在办的一单
var active_stage: int = 0
var week: Array = []          # 七日账，每天一条 {day, earned, cases}

# 暗线：替神收账。收尸时从尸体上「刮」东西，上供攒这个值。
var tribute: int = 0
# demo 收尾：上供够数，未型现身，去赌场合作。
var demo_done := false

# 五门不是你一个人在动。别家也在做事，掉队的会被市场补，领头的会被挤。
var rivals := {"全能之门": 50, "壹祖": 50, "势宗": 50, "未知信仰": 50}
# 官面盯得有多紧：钱多、闹事都会往上抬，官方口碑高能压住。
var official_heat: int = 0
var last_day_report: Dictionary = {}


func _init() -> void:
	reset()


func reset() -> void:
	day = 1
	hours = 6
	money = 0
	rep_street = 50
	rep_trade = 50
	rep_official = 50
	cases_done = 0
	log = []
	active = {}
	active_stage = 0
	week = []
	tribute = 0
	rivals = {"全能之门": 50, "壹祖": 50, "势宗": 50, "未知信仰": 50}
	official_heat = 0
	last_day_report = {}


func hours_left() -> int:
	return hours


func clamp_rep(v: int) -> int:
	return clampi(v, 0, 100)


func _rep(kind: String) -> int:
	match kind:
		"street": return rep_street
		"trade": return rep_trade
		"official": return rep_official
	return 0


func _add_rep(kind: String, delta: int) -> void:
	match kind:
		"street": rep_street = clamp_rep(rep_street + delta)
		"trade": rep_trade = clamp_rep(rep_trade + delta)
		"official": rep_official = clamp_rep(rep_official + delta)


# 每一单的案卷：死因决定怨气，身家决定能收到多少钱，遗愿/仇家是文本钩子。
func draw_case(idx: int) -> Dictionary:
	var pool := [
		{"name": "周三德", "age": 67, "cause": "寿终", "family": "无亲，居委会来办",
			"wish": "葬在老伴旁边", "grudge": "教里发过愿，没还上", "worth": 2200, "special": false},
		{"name": "林巧", "age": 31, "cause": "横死", "family": "丈夫和上小学的儿子",
			"wish": "给孩子留句话", "grudge": "车祸那天车是借来的", "worth": 4600, "special": false},
		{"name": "许国梁", "age": 55, "cause": "病故", "family": "一大家子，长子话多",
			"wish": "别让单位来", "grudge": "欠了老伙计一笔账", "worth": 3000, "special": false},
		{"name": "沈老师", "age": 82, "cause": "寿终", "family": "学生凑的钱",
			"wish": "体面点", "grudge": "想把稿子烧了", "worth": 1800, "special": false},
		{"name": "吴慧珍", "age": 44, "cause": "怨死", "family": "只有个不肯来的女儿",
			"wish": "别让那男人进门", "grudge": "眼里咽不下那口气", "worth": 3200, "special": false},
		{"name": "不知名的男人", "age": 0, "cause": "奇死", "family": "没人认领",
			"wish": "查不到", "grudge": "身上有别人缝的针脚", "worth": 0, "special": true},
		{"name": "小满", "age": 9, "cause": "病故", "family": "妈妈一个人来",
			"wish": "想听个故事", "grudge": "病房里那盏灯", "worth": 1500, "special": false},
		{"name": "老白", "age": 58, "cause": "病故", "family": "老伴还硬朗",
			"wish": "把那只猫送走", "grudge": "儿子八年没回来", "worth": 2400, "special": false},
		{"name": "阿兰", "age": 23, "cause": "横死", "family": "同租的两个女孩",
			"wish": "把欠的钱还上", "grudge": "那天为什么要去天台", "worth": 3900, "special": false},
		{"name": "钱伯", "age": 71, "cause": "寿终", "family": "远房侄子",
			"wish": "别大办", "grudge": "棺材想用自己打的那口", "worth": 5000, "special": false},
	]
	var c: Dictionary = pool[idx % pool.size()].duplicate(true)
	c["risk"] = RISK[c["cause"]]["base"] + (idx % 3) * 3
	c["grudge_now"] = RISK[c["cause"]]["base"]
	return c


# 今天能接的 4 单：按天数轮换窗口，七天不重样。
func today_cases() -> Array:
	var out: Array = []
	for k in 4:
		out.append((day * 4 + k * 2 + 1) % 10)
	return out


# 每道工序的干法。fields：cost 时辰、d 怨气变化、money 钱变化、rep 口碑变化 dict、
# flavor 文案、special 是否暗线动作（收尸时刮东西上供）。
func choices_for(stage: int, c: Dictionary) -> Array:
	var out: Array = []
	match stage:
		0:  # 收尸
			out = [
				{"label": "派徒弟去接", "cost": 1, "grudge": 2, "money": -60,
					"rep": {"trade": -1}, "flavor": "徒弟手脚麻利，就是毛手毛脚。"},
				{"label": "亲自去接", "cost": 2, "grudge": -4, "money": 0,
					"rep": {"street": 1}, "flavor": "你亲自去了，街坊看在眼里。"},
				{"label": "后半夜去，顺手刮点东西", "cost": 2, "grudge": -6, "money": 0,
					"rep": {}, "flavor": "没人看见。刮下来的东西，能上供。", "special": true},
			]
		1:  # 洗身
			out = [
				{"label": "细细擦洗", "cost": 1, "grudge": -5, "money": 0,
					"rep": {"street": 1, "trade": 1}, "flavor": "把身子擦干净，算是对得起。"},
				{"label": "冲一冲了事", "cost": 0, "grudge": 4, "money": 0,
					"rep": {}, "flavor": "水一冲就抬走了。"},
				{"label": "不洗，盖白布", "cost": 0, "grudge": 10, "money": 0,
					"rep": {"street": -1}, "flavor": "白布一盖，眼不见为净。"},
			]
		2:  # 穿衣
			out = [
				{"label": "按规矩穿寿衣", "cost": 1, "grudge": -3, "money": -120,
					"rep": {"trade": 1}, "flavor": "寿衣料子一般，但规矩不能少。"},
				{"label": "家属指定的衣裳", "cost": 1, "grudge": -4, "money": -200,
					"rep": {"street": 2}, "flavor": "家属递来的，穿上去才像那个人。"},
				{"label": "简省点", "cost": 0, "grudge": 6, "money": 40,
					"rep": {"trade": -1}, "flavor": "省下这身衣服钱，账上好看点。"},
			]
		3:  # 念辞
			out = [
				{"label": "照本念一遍", "cost": 1, "grudge": -3, "money": 0,
					"rep": {}, "flavor": "念完就算，不多说一个字。"},
				{"label": "问一句：还能不能更好一点", "cost": 1, "grudge": -8, "money": 0,
					"rep": {"street": 2}, "flavor": "这句话不是念给人听的。", "need_rep": 55},
				{"label": "不念，省时间", "cost": 0, "grudge": 8, "money": 0,
					"rep": {"street": -1}, "flavor": "没时间念辞，下一家还等着。"},
			]
		4:  # 出殡
			out = [
				{"label": "准点出", "cost": 1, "grudge": -3, "money": 0,
					"rep": {"official": 1}, "flavor": "时辰正好，一路没出岔子。"},
				{"label": "加钱加排场", "cost": 2, "grudge": -6, "money": -400,
					"rep": {"street": 2, "trade": 1}, "flavor": "排场给足，来的都点头。"},
				{"label": "草草抬走", "cost": 0, "grudge": 7, "money": 60,
					"rep": {"official": -1}, "flavor": "抬得急，看门的大爷直皱眉。"},
			]
	return out


func can_afford(opt: Dictionary) -> bool:
	return hours >= int(opt.get("cost", 0))


func can_choose(opt: Dictionary) -> bool:
	if opt.has("need_rep"):
		if rep_street < int(opt["need_rep"]) and rep_trade < int(opt["need_rep"]):
			return false
	return true


func start_case(idx: int) -> bool:
	if not active.is_empty():
		return false
	if hours < 1:
		return false
	var c := draw_case(idx)
	active = c
	active_stage = 0
	hours -= 1
	_log("接单：%s（%s）" % [c["name"], c["cause"]])
	return true


func current_case() -> Dictionary:
	return active


func stage_name() -> String:
	if active.is_empty():
		return ""
	return STAGES[clampi(active_stage, 0, STAGES.size() - 1)]


func choose(idx: int) -> Dictionary:
	## 返回 {ok, done, text}；done=true 表示这单办完了。
	if active.is_empty():
		return {"ok": false, "done": false, "text": "手上没单。"}
	var opts: Array = choices_for(active_stage, active)
	if idx < 0 or idx >= opts.size():
		return {"ok": false, "done": false, "text": "没有这个干法。"}
	var opt: Dictionary = opts[idx]
	if not can_afford(opt):
		return {"ok": false, "done": false, "text": "时辰不够了。"}
	if not can_choose(opt):
		return {"ok": false, "done": false, "text": "这句话现在说不出口。"}

	hours -= int(opt.get("cost", 0))
	active["grudge_now"] = clampi(int(active["grudge_now"]) + int(opt.get("grudge", 0)), 0, 100)
	if opt.has("special") and bool(opt["special"]):
		tribute += 1
		_log("从尸体上刮了点东西，上供 +1")

	var text: String = "%s：%s" % [stage_name(), opt["flavor"]]
	_log(text)

	active_stage += 1
	if active_stage >= STAGES.size():
		return _settle()
	return {"ok": true, "done": false, "text": text}


func _settle() -> Dictionary:
	var c := active
	var earned := int(c["worth"]) * (100 - int(c["grudge_now"])) / 100
	# 五道工序里已经扣过成本（寿衣/排场等），这里只算收入。
	money += earned
	cases_done += 1
	_log("结账：%s 收 %d" % [c["name"], earned])

	var res := {"ok": true, "done": true, "text": "", "earned": earned, "grudge": int(c["grudge_now"])}
	# 怨气爆了 = 尸变（突破收容）。
	if int(c["grudge_now"]) >= 85:
		res["haunt"] = true
		rep_official = clamp_rep(rep_official - 8)
		rep_street = clamp_rep(rep_street - 5)
		_log("出事了：尸身不安生，闹了一夜。")
		res["text"] = "夜里尸身不安生，闹了一场。官方来问过话。"
	else:
		res["text"] = "这一单办完了。"
	# 特殊单：替神收账的，不给钱，给口碑和上供。
	if bool(c.get("special", false)):
		res["text"] += "（这单没人给钱，但上面的记下了。）"

	week.append({"day": day, "earned": earned, "cases": cases_done})
	active = {}
	active_stage = 0
	return res


func end_day() -> Dictionary:
	## 打烊。日结里要说清「今天世界也动了」：人情会淡、别家在追、官面在看。
	var decay := _rep_decay()
	var press := rival_pressure()
	var heat_delta := 1
	if week.size() > 0 and int(week[-1]["earned"]) >= 80:
		heat_delta += 1
	if rep_official >= 70:
		heat_delta -= 1
	official_heat = clampi(official_heat + heat_delta, 0, 100)

	var summary := {
		"day": day, "money": money, "hours": hours,
		"street": rep_street, "trade": rep_trade, "official": rep_official,
		"tribute": tribute, "week_end": day >= 7,
		"decay": decay, "press": press,
		"heat": official_heat, "heat_text": official_stage(),
		"rivals": rivals.duplicate(),
	}
	last_day_report = summary
	day += 1
	hours = 6
	return summary


func _rep_decay() -> Dictionary:
	## 人情会淡。高于中位的口碑每天自己往下掉，越高掉得越快。
	var d := {}
	for k in ["street", "trade", "official"]:
		var v: int = _rep(k)
		if v > 50:
			var lose: int = 1 if v < 70 else 2
			_add_rep(k, -lose)
			d[k] = -lose
	if not d.is_empty():
		_log("人情淡了一点。")
	return d


func rival_pressure() -> Dictionary:
	## 别家也在开门。掉队的那门吃市场补偿，领头的会被挤。
	var leader := ""
	var top := -1
	for name in rivals:
		if int(rivals[name]) > top:
			top = int(rivals[name])
			leader = name
	var laggard := ""
	var low := 999
	for name in rivals:
		if int(rivals[name]) < low:
			low = int(rivals[name])
			laggard = name

	var today := 0
	if week.size() > 0:
		today = int(week[-1]["earned"])
	var squeeze := 0
	var notes: Array = []
	if today >= 60:
		squeeze = 1
		_add_rep("trade", -1)
		notes.append("同业有人议价：这一带的价被你压了。")

	for name in rivals:
		var step := 1
		if name == laggard:
			step = 3
		if name == leader and top >= 80:
			step = 0
		rivals[name] = clampi(int(rivals[name]) + step, 0, 100)
	# 大家挨得太近就不算掉队，免得每天都说「某某在追」。
	var lagging: String = laggard if (top - low) >= 10 else ""
	return {"squeeze": squeeze, "notes": notes, "laggard": lagging, "leader": leader, "gap": top - low}


func official_stage() -> String:
	## 官面看得见的进度，不给你一个看不懂的数字。
	if official_heat < 15:
		return "没人管你"
	elif official_heat < 35:
		return "有人来问过一句"
	elif official_heat < 60:
		return "有人上门看账"
	return "他们开始记你的名字"


func week_ledger() -> Array:
	## 七日结账：写成账，不甩数字。
	var by_day := {}
	var order: Array = []
	for w in week:
		var d: int = int(w["day"])
		if not by_day.has(d):
			by_day[d] = {"earned": 0, "cases": 0}
			order.append(d)
		by_day[d]["earned"] += int(w["earned"])
		by_day[d]["cases"] += 1
	var lines: Array = []
	if order.is_empty():
		lines.append("这一周还没开张。")
		lines.append("七日合计 ¥0")
		lines.append("官面：%s" % official_stage())
		return lines
	# 只结最近七个有记录的日子，跨周不把旧账带进来。
	if order.size() > 7:
		order = order.slice(order.size() - 7)
	var total := 0
	var first: int = int(order[0])
	var last: int = int(order[order.size() - 1])
	for d in range(first, last + 1):
		if by_day.has(d):
			var row: Dictionary = by_day[d]
			total += int(row["earned"])
			lines.append("第 %d 日 · 办 %d 单 · 进 ¥%d" % [d, int(row["cases"]), int(row["earned"])])
		else:
			lines.append("第 %d 日 · 没开张" % d)
	lines.append("七日合计 ¥%d" % total)
	lines.append("官面：%s" % official_stage())
	return lines


func week_total() -> int:
	var t := 0
	for w in week:
		t += int(w["earned"])
	return t


func casino_ready() -> bool:
	## 上供攒够，未型（Eidos）露面，请你去赌场做托。demo 收尾点。
	return tribute >= 3 and not demo_done


func accept_deal() -> Dictionary:
	demo_done = true
	var s := "未型在赌场门口等你。他说：殡仪馆的账，赌场愿意帮着平。"
	s += "你以后在赌场做托，客人赢，你抽两成；客人输，账记在殡仪馆头上。"
	s += "（demo 到此为止。剩下的路，等你想好了再开。）"
	return {"ok": true, "text": s}


func _log(s: String) -> void:
	log.append(s)
	if log.size() > 30:
		log.pop_front()

# ---------------- 赌场：当托 ----------------
var casino_games := 0
var last_dice: Array = []

func casino_bet(bet: int, pick: String, style: String) -> Dictionary:
	## pick: "big" / "small"；style: "straight" 照押 / "water" 放水当托。
	if hours < 1:
		return {"ok": false, "text": "没时辰了，明天再上桌。"}
	if money < bet:
		return {"ok": false, "text": "钱不够下注。"}
	hours -= 1
	money -= bet

	var d := [randi_range(1, 6), randi_range(1, 6), randi_range(1, 6)]
	last_dice = d
	var total: int = d[0] + d[1] + d[2]
	var triple: bool = d[0] == d[1] and d[1] == d[2]
	var big: bool = total >= 11
	var my_pick := pick
	var guest_pick := "big" if my_pick == "small" else "small"
	if style == "water":
		my_pick = "big" if randi_range(0, 1) == 0 else "small"
		guest_pick = "big" if my_pick == "small" else "small"

	var hit: bool = (not triple) and (big == (my_pick == "big"))
	var text := ""
	if hit:
		var gain: int = bet * 2
		money += gain
		text = "开 %d 点，%s。押中，进 ¥%d。" % [total, "大" if big else "小", gain]
		_add_rep("trade", 1)
	else:
		if style == "water":
			if triple:
				text = "开 %d 点，三同通杀。两边都没了，赌场不认账。" % total
				_add_rep("trade", -1)
			else:
				var fee: int = int(round(bet * 0.6))
				money += fee
				_add_rep("street", 1)
				text = "开 %d 点，%s。客人押%s，赢了。赌场抽你 ¥%d。" % [
					total, "大" if big else "小",
					"大" if guest_pick == "big" else "小", fee]
		else:
			text = "开 %d 点%s。输了 ¥%d。" % [total, "，三同通杀" if triple else ("，%s" % ("大" if big else "小")), bet]
			_add_rep("trade", -1)

	casino_games += 1
	_log(text)
	return {"ok": true, "text": text, "dice": d, "total": total, "hit": hit, "triple": triple}

# ---------------- 大学：花时辰换东西 ----------------
func uni_lesson() -> Dictionary:
	if hours <= 0:
		return {"ok": false, "text": "今天没工夫了。"}
	hours -= 1
	rep_trade = clamp_rep(rep_trade + 3)
	_log("去阶梯教室听了一堂课。")
	return {"ok": true, "text": "讲台上市侩地讲：「丧礼是给活人办的。」
同业高看你三分。"}


func uni_archive() -> Dictionary:
	if hours <= 0:
		return {"ok": false, "text": "今天没工夫了。"}
	if money < 60:
		return {"ok": false, "text": "查档要交六十块复印费，你掏不出来。"}
	hours -= 1
	money -= 60
	official_heat = maxi(0, official_heat - 2)
	rep_official = clamp_rep(rep_official + 2)
	_log("翻了半天旧档，把规矩看明白一点。")
	return {"ok": true, "text": "旧档里写着三十年前同样的纠纷，怎么判的、谁签的字。
官面那边松了一点。"}


func uni_hire() -> Dictionary:
	if money < 150:
		return {"ok": false, "text": "雇一个学生要一百五，你掏不出来。"}
	if hours >= 8:
		return {"ok": false, "text": "今天已经排满了。"}
	money -= 150
	hours += 1
	_log("花一百五雇了个学生搭手。")
	return {"ok": true, "text": "一个学民俗的学生来搭手，今天能多办一点。"}

