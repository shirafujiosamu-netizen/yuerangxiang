extends SceneTree
## headless 单测：game.gd 纯逻辑。godot --headless --script res://tests/test_game.gd

var _pass := 0
var _fail := 0


func _init() -> void:
	_run()
	printerr("=== %d 过 / %d 挂 ===" % [_pass, _fail])
	if _fail > 0:
		quit(1)
	else:
		quit(0)


func check(cond: bool, msg: String) -> void:
	if cond:
		_pass += 1
	else:
		_fail += 1
		printerr("FAIL: " + msg)


func _run() -> void:
	var g = preload("res://src/game.gd").new()

	# 初始状态
	check(g.day == 1, "day 从 1 起")
	check(g.rivals.size() == 4, "四门各有一票")
	check(g.official_heat == 0, "官面一开始没温度")
	check(g.official_stage() == "没人管你", "开局没人管你")
	check(g.hours == 6, "时辰 6 格")

	# today_cases 轮换窗口
	var tc: Array = g.today_cases()
	check(tc.size() == 4, "today_cases 给 4 单")
	var all_ok := true
	for i in tc:
		if int(i) < 0 or int(i) >= 10:
			all_ok = false
	check(all_ok, "today_cases 索引在 0..9")
	var seen := {}
	for d in range(1, 8):
		g.day = d
		for i in g.today_cases():
			seen[i] = true
	check(int(seen.get(5, 0)) == 1, "特殊单一周内会出现")
	check(g.money == 0, "钱 0")
	check(g.rep_street == 50 and g.rep_trade == 50 and g.rep_official == 50, "口碑三群 50")

	# 接单花 1 格
	check(g.start_case(0), "能接单")
	check(g.hours == 5, "接单花 1 格")
	check(not g.active.is_empty(), "有进行中的案卷")
	check(g.stage_name() == "收尸", "第一道是收尸")

	# 五道工序走到底
	var stages := ["收尸", "洗身", "穿衣", "念辞", "出殡"]
	for i in range(5):
		var s: String = g.stage_name()
		check(s == stages[i], "第 %d 道是 %s（实际 %s）" % [i, stages[i], s])
		var r: Dictionary = g.choose(0)
		check(bool(r["ok"]), "第 %d 道能选干法" % i)
	check(g.active.is_empty(), "五道走完案卷清空")
	check(g.cases_done == 1, "办完 1 单")

	# 时辰耗尽挡接单
	var g2 = preload("res://src/game.gd").new()
	g2.hours = 0
	check(not g2.start_case(0), "没时辰不能接单")

	# 时辰不够挡工序
	var g3 = preload("res://src/game.gd").new()
	g3.start_case(0)
	g3.hours = 0
	var r3: Dictionary = g3.choose(1)  # 亲自去接 cost 2
	check(not bool(r3["ok"]), "时辰不够挡下道工序")

	# 怨气随选择升降
	var g4 = preload("res://src/game.gd").new()
	g4.start_case(0)  # 寿终，grudge_now 起点 0
	g4.choose(2)      # 收尸·刮东西：-6（但 clamp 到 0）
	g4.choose(2)      # 洗身·不洗：+10
	check(g4.active["grudge_now"] == 10, "不洗 +10 怨气（0 起）")

	# 问一句的门槛：双群都低于 55 时说不出口
	var g5 = preload("res://src/game.gd").new()
	g5.start_case(0)
	for _i in range(3):
		g5.choose(0)
	g5.rep_street = 40
	g5.rep_trade = 40
	var r5: Dictionary = g5.choose(1)  # 念辞·问一句
	check(not bool(r5["ok"]), "口碑不够，问一句说不出口")

	# 特殊单：刮东西上供 + 不给钱
	var g6 = preload("res://src/game.gd").new()
	g6.start_case(5)  # 奇死·不知名的男人，special
	check(g6.active.get("special", false) == true, "5 号案卷是特殊单")
	g6.choose(2)      # 收尸·刮东西
	check(g6.tribute == 1, "上供 +1")
	# 一路念完
	g6.choose(0); g6.choose(0); g6.choose(0); g6.choose(0)
	check(g6.money == 0, "特殊单 worth 0，不收钱")

	# 尸变：怨气 >= 85
	var g7 = preload("res://src/game.gd").new()
	g7.start_case(4)  # 怨死，起点 60
	g7.choose(1)      # 亲自去 -4
	g7.choose(1)      # 冲一冲 +4
	g7.choose(1)      # 家属指定 -4
	g7.choose(0)      # 照本念 -3
	var r7: Dictionary = g7.choose(0)  # 准点出 -3 → 50，不爆
	check(not r7.has("haunt"), "60 怨死做对了不尸变")
	var g8 = preload("res://src/game.gd").new()
	g8.start_case(4)  # 怨死 60，一路最差
	g8.choose(0)      # 派徒弟 +2
	g8.choose(2)      # 不洗 +10
	g8.choose(2)      # 简省 +6
	g8.choose(2)      # 不念 +8
	g8.choose(2)      # 草草 +7 → 93 爆
	check(g8.rep_official < 50, "尸变扣官方口碑")

	# 日结
	var g9 = preload("res://src/game.gd").new()
	var s: Dictionary = g9.end_day()
	check(g9.day == 2, "日结后第 2 天")
	check(g9.hours == 6, "日结重置时辰")
	check(not bool(s["week_end"]), "第 1 天不是周结")
	for _i in range(5):
		g9.end_day()
	check(g9.day == 7, "走了 6 天到第 7 天")
	var s7: Dictionary = g9.end_day()
	check(bool(s7["week_end"]), "第 7 天是周结")

	# 一周进账累加
	var g10 = preload("res://src/game.gd").new()
	g10.start_case(0)  # 寿终，正常做完
	for _st in range(5):
		g10.choose(0)
	check(g10.week_total() >= 0, "week_total 有值")

	# 赌场：当托
	var gc = preload("res://src/game.gd").new()
	gc.money = 500
	seed(12345)
	var r1: Dictionary = gc.casino_bet(100, "big", "straight")
	check(bool(r1["ok"]), "照押能下注")
	check(gc.hours == 5, "下注花一格时辰")
	check(gc.money <= 600 and gc.money >= 0, "照押后钱在合理区间")
	check(r1.has("dice") and (r1["dice"] as Array).size() == 3, "三颗骰子")
	var total_ok := int(r1["total"]) >= 3 and int(r1["total"]) <= 18
	check(total_ok, "点数在 3..18")

	# 放水：赢了也要有进账（佣金或赌赢），街坊涨
	var gd = preload("res://src/game.gd").new()
	gd.money = 500
	seed(777)
	var before_street: int = gd.rep_street
	var r2: Dictionary = gd.casino_bet(100, "big", "water")
	check(bool(r2["ok"]), "放水能下注")
	check(gd.rep_street >= before_street, "放水后街坊不掉")
	check(gd.money >= 0, "放水后钱不为负")

	# 时辰不够就不让上桌
	var ge = preload("res://src/game.gd").new()
	ge.money = 500
	ge.hours = 0
	var rc1: Dictionary = ge.casino_bet(100, "big", "straight")
	check(not bool(rc1["ok"]), "没时辰不能下注")

	# 钱不够也不让下注
	var gf = preload("res://src/game.gd").new()
	gf.money = 50
	var rc2: Dictionary = gf.casino_bet(100, "big", "straight")
	check(not bool(rc2["ok"]), "钱不够不能下注")

	# 完整玩通一遍到赌场收尾：三次特殊单攒上供
	var g11 = preload("res://src/game.gd").new()
	var guard := 0
	while not g11.casino_ready() and guard < 12:
		guard += 1
		if g11.hours < 1:
			g11.end_day()
			continue
		g11.start_case(5)          # 奇死·特殊单（替神收账）
		g11.choose(2)              # 收尸·刮东西 +1 上供
		g11.choose(2)              # 洗身·不洗
		g11.choose(2)              # 穿衣·简省
		g11.choose(2)              # 念辞·不念
		g11.choose(2)              # 出殡·草草 → 结算
		g11.end_day()

	# ---- 反馈循环：人情会淡 / 别家在追 / 官面会热 ----
	var gfb = preload("res://src/game.gd").new()
	gfb.rep_street = 80
	var rep_before: int = gfb.rep_street
	var sr: Dictionary = gfb.end_day()
	check(gfb.rep_street < rep_before, "口碑高于中位会自己往下掉")
	check(int(sr["decay"].get("street", 0)) < 0, "日结里写明掉了多少")
	check(rep_before - gfb.rep_street == 2, "80 的口碑一天掉 2")

	var gl = preload("res://src/game.gd").new()
	gl.rivals = {"全能之门": 90, "壹祖": 20, "势宗": 50, "未知信仰": 50}
	var pr: Dictionary = gl.rival_pressure()
	check(pr["laggard"] == "壹祖", "掉队的那门被认出来")
	check(int(gl.rivals["壹祖"]) == 23, "掉队的吃 3 点补偿")
	check(int(gl.rivals["全能之门"]) == 90, "领跑且过 80 的不再涨")

	var gq = preload("res://src/game.gd").new()
	gq.week = [{"day": 1, "earned": 70, "cases": 1}]
	var pr2: Dictionary = gq.rival_pressure()
	check(int(pr2["squeeze"]) == 1, "赚得多会引来同业议价")
	check(gq.rep_trade < 50, "议价压同业口碑")

	var go = preload("res://src/game.gd").new()
	go.official_heat = 0
	go.end_day()
	check(go.official_heat == 1, "一天过去官面 +1")
	check(go.official_stage() == "没人管你", "热度 1 还没人管")
	go.official_heat = 40
	check(go.official_stage() == "有人上门看账", "热度 40 有人看账")
	go.official_heat = 80
	check(go.official_stage().contains("名字"), "热度 80 被记住了")

	var gw = preload("res://src/game.gd").new()
	gw.week = [
		{"day": 1, "earned": 30, "cases": 1},
		{"day": 1, "earned": 20, "cases": 2},
		{"day": 2, "earned": 40, "cases": 3},
	]
	var lines: Array = gw.week_ledger()
	check(str(lines[0]).contains("第 1 日") and str(lines[0]).contains("50"), "账目按天合并")
	check(str(lines[lines.size() - 2]).contains("90"), "七日合计对")
	var gempty = preload("res://src/game.gd").new()
	check(str(gempty.week_ledger()[0]).contains("没开张"), "没开张也有一句话")
	check(g11.tribute >= 3, "三次特殊单上供攒满")
	check(g11.casino_ready(), "赌场收尾可触发")
	var dl: Dictionary = g11.accept_deal()
	check(g11.demo_done and bool(dl["ok"]), "接受合作，demo 完成")
	# 大学：花时辰换东西
	var gu = preload("res://src/game.gd").new()
	gu.money = 500
	var trade_before: int = gu.rep_trade
	var h0: int = gu.hours
	var ur1: Dictionary = gu.uni_lesson()
	check(bool(ur1["ok"]) and gu.hours == h0 - 1, "听课花一格")
	check(gu.rep_trade == trade_before + 3, "听课同业 +3")

	gu.official_heat = 10
	var h1: int = gu.hours
	var m1: int = gu.money
	var ur2: Dictionary = gu.uni_archive()
	check(bool(ur2["ok"]) and gu.hours == h1 - 1 and gu.money == m1 - 60, "查档花一格六十块")
	check(gu.official_heat == 8, "查档热度 -2")

	var h2: int = gu.hours
	var m2: int = gu.money
	var ur3: Dictionary = gu.uni_hire()
	check(bool(ur3["ok"]) and gu.hours == h2 + 1 and gu.money == m2 - 150, "雇学生多一格")

	gu.money = 0
	check(not bool(gu.uni_hire()["ok"]), "没钱雇不了")
	gu.hours = 0
	check(not bool(gu.uni_lesson()["ok"]), "没时辰听不了")

