import io

p = r'F:\job\oc-game\godot\main.gd'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, 'count mismatch (got %d): %r' % (s.count(old), old[:60])
    s = s.replace(old, new, 1)

# 1) 成员：status_label + _msg setter
rep('var work_open := false\nvar _msg := ""\nvar ui_layer: CanvasLayer',
    'var work_open := false\nvar _msg := "": set(v):\n\t_msg = v\n\tif v != "" and is_instance_valid(status_label):\n\t\tstatus_label.text = v\nvar status_label: Label\nvar ui_layer: CanvasLayer')

# 2) 顶部中间加状态行（放在 gear 之后、hud 之前）
rep('\tgear.pressed.connect(_open_settings)\n\tlayer.add_child(gear)\n\n\t# 左下：资源',
    '\tgear.pressed.connect(_open_settings)\n\tlayer.add_child(gear)\n\n\t# 顶中：状态行（最近一件事）\n\tstatus_label = _make_label("", 16, Color(0.82, 0.80, 0.77, 0.95))\n\tstatus_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER\n\tstatus_label.anchor_left = 0.5\n\tstatus_label.anchor_right = 0.5\n\tstatus_label.offset_left = -420\n\tstatus_label.offset_right = 420\n\tstatus_label.offset_top = 26\n\tstatus_label.add_theme_stylebox_override("normal", _glass(0.5, 12))\n\tstatus_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART\n\tlayer.add_child(status_label)\n\n\t# 左下：资源')

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched status OK')
