import io

p = r'F:\job\oc-game\godot\main.gd'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, 'count mismatch for: %r (got %d)' % (old[:60], s.count(old))
    s = s.replace(old, new, 1)

# 1) 成员变量
rep('var work_open := false\nvar _msg := ""',
    'var work_open := false\nvar _msg := ""\nvar ui_layer: CanvasLayer\nvar title_overlay: Control\nvar summary_panel: PanelContainer\nvar started := false')

# 2) _setup_ui 末尾挂 ui_layer + 标题画面
rep('\twork_box.add_theme_constant_override("separation", 10)\n\twork_panel.add_child(work_box)\n',
    '\twork_box.add_theme_constant_override("separation", 10)\n\twork_panel.add_child(work_box)\n\n\tui_layer = layer\n\t_build_title_screen(layer)\n')

# 3) 插入标题画面 + 开始 + 周结函数（放在 _wrap_chip 之前）
anchor = 'func _wrap_chip(name: String, value: Label) -> PanelContainer:'
funcs = '''func _build_title_screen(layer: CanvasLayer) -> void:
\ttitle_overlay = Control.new()
\ttitle_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
\tvar dim := ColorRect.new()
\tdim.set_anchors_preset(Control.PRESET_FULL_RECT)
\tdim.color = Color(0.03, 0.03, 0.035, 0.95)
\ttitle_overlay.add_child(dim)

\tvar box := VBoxContainer.new()
\tbox.set_anchors_preset(Control.PRESET_FULL_RECT)
\tbox.alignment = BoxContainer.ALIGNMENT_CENTER
\tbox.add_theme_constant_override("separation", 14)
\ttitle_overlay.add_child(box)

\tvar t := _make_label("黄昏之门", 66, WHITE)
\tt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(t)

\tvar rule := ColorRect.new()
\trule.color = RED
\trule.custom_minimum_size = Vector2(120, 4)
\trule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
\tbox.add_child(rule)

\tvar sub := _make_label("殡仪馆 · 服务大厅", 20, GREY)
\tsub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(sub)

\tvar intro := _make_label("替神收账的殡仪馆。接单，送人，七天一个来回。", 15, Color(0.70, 0.68, 0.66))
\tintro.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(intro)

\tvar btn := Button.new()
\tbtn.text = "开  始"
\tbtn.add_theme_font_size_override("font_size", 22)
\tbtn.add_theme_color_override("font_color", WHITE)
\tvar bs := StyleBoxFlat.new()
\tbs.bg_color = RED
\tbs.set_corner_radius_all(4)
\tbs.content_margin_left = 44
\tbs.content_margin_right = 44
\tbs.content_margin_top = 12
\tbs.content_margin_bottom = 12
\tbtn.add_theme_stylebox_override("normal", bs)
\tvar bsh: StyleBoxFlat = bs.duplicate()
\tbsh.bg_color = RED_SOFT
\tbtn.add_theme_stylebox_override("hover", bsh)
\tbtn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
\tbtn.pressed.connect(_start_game)
\tbox.add_child(btn)

\tvar ctl := _make_label("WASD 走动 · 右键转视角 · 左键点门面 · Esc 关闭", 13, Color(0.50, 0.48, 0.46))
\tctl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(ctl)

\tlayer.add_child(title_overlay)


func _start_game() -> void:
\tif is_instance_valid(title_overlay):
\t\ttitle_overlay.queue_free()
\t\ttitle_overlay = null
\tstarted = true
\t_msg = "第 1 天。大厅还没上人，去服务台接单。"


func _show_week_summary() -> void:
\tsummary_panel = PanelContainer.new()
\tsummary_panel.add_theme_stylebox_override("panel", _glass(0.92, 18))
\tsummary_panel.custom_minimum_size = Vector2(440, 0)
\tvar v := VBoxContainer.new()
\tv.add_theme_constant_override("separation", 6)
\tsummary_panel.add_child(v)
\tvar head := _make_label("七日结账", 24, RED_SOFT)
\thead.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tv.add_child(head)
\tvar weekno := _make_label("第 %d 周" % (int((game.day - 1) / 7) + 1), 13, GREY)
\tweekno.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tv.add_child(weekno)
\tv.add_child(_rule())
\tfor w in game.week:
\t\tvar row := _make_label("第 %d 天   进账 ¥%d   办 %d 单" % [int(w["day"]), int(w["earned"]), int(w["cases"])], 16, WHITE)
\t\tv.add_child(row)
\tvar total := _make_label("本周共 ¥%d" % game.week_total(), 20, WHITE)
\ttotal.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tv.add_child(total)
\tvar btn := Button.new()
\tbtn.text = "合上账本"
\tbtn.add_theme_color_override("font_color", WHITE)
\tbtn.add_theme_stylebox_override("normal", _glass(0.6, 8))
\tbtn.pressed.connect(func():
\t\tif is_instance_valid(summary_panel):
\t\t\tsummary_panel.queue_free()
\t)
\tv.add_child(btn)
\tui_layer.add_child(summary_panel)
\tvar vp := get_viewport().get_visible_rect().size
\tsummary_panel.position = Vector2(vp.x * 0.5 - 220, vp.y * 0.5 - 170)


'''
rep(anchor, funcs + anchor)

# 4) 周结时弹面板
rep('\tvar s: Dictionary = game.end_day()\n\t_msg = "第 %d 天打烊，账已记下。" % int(s["day"])\n\tif bool(s["week_end"]):\n\t\t_msg += " 七日满，这一周进账 ¥%d。" % game.week_total()\n\t_render_work()\n\t_refresh_hud()',
    '\tvar s: Dictionary = game.end_day()\n\t_msg = "第 %d 天打烊，账已记下。" % int(s["day"])\n\tif bool(s["week_end"]):\n\t\t_show_week_summary()\n\t_render_work()\n\t_refresh_hud()')

# 5) 标题画面期间屏蔽输入
rep('func _input(event: InputEvent) -> void:\n\tif event is InputEventMouseButton:',
    'func _input(event: InputEvent) -> void:\n\tif not started and is_instance_valid(title_overlay):\n\t\treturn\n\tif event is InputEventMouseButton:')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched OK')
