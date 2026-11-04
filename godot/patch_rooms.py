# -*- coding: utf-8 -*-
import io

p = r'F:\job\oc-game\godot\main.gd'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert s.count(old) == 1, "NOT FOUND or MULTIPLE: %r (count=%d)" % (old[:60], s.count(old))
    s = s.replace(old, new, 1)

# 1) preloads
rep('const CASINO := preload("res://assets/casino.glb")',
    'const CASINO := preload("res://assets/casino.glb")\n'
    'const UNIVERSITY := preload("res://assets/university.glb")\n'
    'const BOOKSHOP := preload("res://assets/bookshop.glb")')

# 2) members
rep('var casino_node: Node3D\nvar in_casino := false',
    'var casino_node: Node3D\n'
    'var university_node: Node3D\n'
    'var bookshop_node: Node3D\n'
    'var cur_room := 0\n'
    'var back_btn: Label')

# 3) instantiate
rep('\tcasino_node = CASINO.instantiate()\n\tadd_child(casino_node)\n\tcasino_node.visible = false',
    '\tcasino_node = CASINO.instantiate()\n\tadd_child(casino_node)\n\tcasino_node.visible = false\n'
    '\tuniversity_node = UNIVERSITY.instantiate()\n\tadd_child(university_node)\n\tuniversity_node.visible = false\n'
    '\tbookshop_node = BOOKSHOP.instantiate()\n\tadd_child(bookshop_node)\n\tbookshop_node.visible = false')

# 4) _do_casino guard
rep('\tif not in_casino:\n\t\t_enter_casino()',
    '\tif cur_room != 1:\n\t\t_enter_casino()')

# 5) _enter_casino -> _goto_room, and define room helpers
rep('func _enter_casino() -> void:\n'
    '\tin_casino = true\n'
    '\troom_node.visible = false\n'
    '\tcasino_node.visible = true\n'
    '\tcam.position = Vector3(2.8, 1.7, 7.0)\n'
    '\tyaw = 0.39\n'
    '\tpitch = -0.05\n'
    '\t_apply_look()\n'
    '\t_spawn_casino_lights()',
    'func _enter_casino() -> void:\n'
    '\t_goto_room(1)\n'
    '\t_spawn_casino_lights()\n'
    '\n'
    '\n'
    'func _goto_room(i: int) -> void:\n'
    '\tcur_room = i\n'
    '\troom_node.visible = (i == 0)\n'
    '\tcasino_node.visible = (i == 1)\n'
    '\tuniversity_node.visible = (i == 2)\n'
    '\tbookshop_node.visible = (i == 3)\n'
    '\tmatch i:\n'
    '\t\t0:\n'
    '\t\t\tcam.position = Vector3(1.2, 1.68, 7.4)\n'
    '\t\t\tyaw = 0.0\n'
    '\t\t\tpitch = -0.03\n'
    '\t\t1:\n'
    '\t\t\tcam.position = Vector3(2.8, 1.7, 7.0)\n'
    '\t\t\tyaw = 0.39\n'
    '\t\t\tpitch = -0.05\n'
    '\t\t2:\n'
    '\t\t\tcam.position = Vector3(0.0, 1.7, 5.6)\n'
    '\t\t\tyaw = 0.0\n'
    '\t\t\tpitch = -0.03\n'
    '\t\t3:\n'
    '\t\t\tcam.position = Vector3(0.0, 1.6, 5.2)\n'
    '\t\t\tyaw = 0.0\n'
    '\t\t\tpitch = -0.03\n'
    '\t_apply_look()\n'
    '\tif i != 0:\n'
    '\t\tif back_btn == null:\n'
    '\t\t\tback_btn = _make_label("\\u27f5 \\u56de\\u5230\\u5927\\u5385", 16, Color(0.72, 0.20, 0.14, 0.95))\n'
    '\t\t\tback_btn.mouse_filter = Control.MOUSE_FILTER_STOP\n'
    '\t\t\tback_btn.gui_input.connect(_on_back_clicked)\n'
    '\t\t\tui_layer.add_child(back_btn)\n'
    '\t\t\tback_btn.position = Vector2(24, 22)\n'
    '\t\tback_btn.visible = true\n'
    '\telse:\n'
    '\t\tif back_btn != null:\n'
    '\t\t\tback_btn.visible = false\n'
    '\n'
    '\n'
    'func _on_back_clicked(ev: InputEvent) -> void:\n'
    '\tif ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:\n'
    '\t\t_sfx("res://audio/click.wav")\n'
    '\t\t_goto_room(0)')

# 6) _process clamp
rep('\t\tif in_casino:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -9.5, 9.5)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -7.5, 7.5)\n'
    '\t\telse:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -12.0, 12.0)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -9.2, 9.2)',
    '\t\tif cur_room == 1:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -9.5, 9.5)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -7.5, 7.5)\n'
    '\t\telif cur_room == 2:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -8.0, 8.0)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -5.5, 5.5)\n'
    '\t\telif cur_room == 3:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -6.5, 6.5)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -5.0, 5.0)\n'
    '\t\telse:\n'
    '\t\t\tcam.position.x = clamp(cam.position.x, -12.0, 12.0)\n'
    '\t\t\tcam.position.z = clamp(cam.position.z, -9.2, 9.2)')

# 7) _update_hover guard
rep('func _update_hover() -> void:\n\tvar mouse := get_viewport().get_mouse_position()',
    'func _update_hover() -> void:\n'
    '\tif cur_room != 0:\n'
    '\t\tcurrent = -1\n'
    '\t\thover_label.text = ""\n'
    '\t\treturn\n'
    '\tvar mouse := get_viewport().get_mouse_position()')

# 8) _input number keys (generalize the Esc elif)
rep('\telif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:\n'
    '\t\tif settings_open:\n'
    '\t\t\t_close_settings()\n'
    '\t\telif work_open:\n'
    '\t\t\t_close_work()\n'
    '\t\telif panel_open:\n'
    '\t\t\t_close_panel()',
    '\telif event is InputEventKey and event.pressed:\n'
    '\t\tif event.keycode == KEY_ESCAPE:\n'
    '\t\t\tif settings_open:\n'
    '\t\t\t\t_close_settings()\n'
    '\t\t\telif work_open:\n'
    '\t\t\t\t_close_work()\n'
    '\t\t\telif panel_open:\n'
    '\t\t\t\t_close_panel()\n'
    '\t\telif event.keycode == KEY_1:\n'
    '\t\t\t_goto_room(0)\n'
    '\t\telif event.keycode == KEY_2:\n'
    '\t\t\t_goto_room(1)\n'
    '\t\telif event.keycode == KEY_3:\n'
    '\t\t\t_goto_room(2)\n'
    '\t\telif event.keycode == KEY_4:\n'
    '\t\t\t_goto_room(3)')

# 9) capture branches --shot10/--shot11
rep('\telif "--shot9" in OS.get_cmdline_user_args():',
    '\telif "--shot10" in OS.get_cmdline_user_args():\n'
    '\t\t_start_game()\n'
    '\t\t_goto_room(2)\n'
    '\t\tfor i in 4:\n'
    '\t\t\tawait get_tree().process_frame\n'
    '\telif "--shot11" in OS.get_cmdline_user_args():\n'
    '\t\t_start_game()\n'
    '\t\t_goto_room(3)\n'
    '\t\tfor i in 4:\n'
    '\t\t\tawait get_tree().process_frame\n'
    '\telif "--shot9" in OS.get_cmdline_user_args():')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('PATCH OK')
