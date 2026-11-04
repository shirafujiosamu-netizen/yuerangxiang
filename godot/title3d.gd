extends Node3D
class_name TitleScene
## 开始界面：真实星表星空 + 五颗星球，可拖拽转宇宙、可单转星球。

signal picked(index: int)

const DEFS := [
	{
		"name": "完人之门", "trade": "殡仪馆", "playable": true,
		"tex": "res://assets/planets/moon.png", "norm": "",
		"pos": Vector3(-15.4, 17.0, -62.0), "radius": 1.7, "tilt": -12.0,
		"color": Color(0.62, 0.60, 0.56), "tex_mix": 0.30,
		"atmo": Color(0.55, 0.62, 0.78, 1.0), "atmo_a": 0.0, "shade": Color(0.40, 0.39, 0.40),
	},
	{
		"name": "全能之门", "trade": "旧书店 · 档案", "playable": false,
		"tex": "res://assets/planets/exo_teal.png", "norm": "",
		"pos": Vector3(-15.4, 14.2, -62.0), "radius": 0.9, "tilt": 8.0,
		"color": Color(0.58, 0.67, 0.74), "tex_mix": 0.10,
		"atmo": Color(0.42, 0.78, 0.95, 1.0), "atmo_a": 0.0, "shade": Color(0.36, 0.46, 0.60),
	},
	{
		"name": "未知信仰", "trade": "酒馆 · 猫径 Catway", "playable": false,
		"tex": "res://assets/planets/exo_teal.png", "norm": "",
		"pos": Vector3(-15.4, 11.4, -62.0), "radius": 1.2, "tilt": 3.0,
		"color": Color(0.24, 0.38, 0.33), "tex_mix": 0.12,
		"atmo": Color(0.30, 0.60, 0.40, 1.0), "atmo_a": 0.0, "shade": Color(0.03, 0.24, 0.13),
	},
	{
		"name": "壹祖", "trade": "寺庙", "playable": false,
		"tex": "res://assets/planets/jupiter.png", "norm": "",
		"pos": Vector3(-15.4, 8.6, -62.0), "radius": 0.7, "tilt": -6.0,
		"color": Color(0.79, 0.44, 0.20), "tex_mix": 0.10,
		"atmo": Color(0.85, 0.70, 0.48, 1.0), "atmo_a": 0.0, "shade": Color(0.60, 0.26, 0.08),
	},
	{
		"name": "势宗", "trade": "面馆", "playable": false,
		"tex": "res://assets/planets/exo_violet.png", "norm": "",
		"pos": Vector3(-15.4, 5.8, -62.0), "radius": 1.5, "tilt": 11.0,
		"color": Color(0.72, 0.20, 0.14), "tex_mix": 0.10,
		"atmo": Color(0.85, 0.52, 0.78, 1.0), "atmo_a": 0.0, "shade": Color(0.46, 0.05, 0.04),
	},
]

var cam: Camera3D
var universe: Node3D
var world_nodes: Array[MeshInstance3D] = []
var world_radius: Array[float] = []
var spin: Array[float] = []
var labels: Array[Label] = []
var label_offsets: Array[Vector2] = [
	Vector2(0, 0),
	Vector2(0, 0),
	Vector2(0, 12),
	Vector2(0, 0),
	Vector2(0, 0),
]
var ui: CanvasLayer
var big_title: Label
var title_font: FontFile
var sub_label: Label
var hint_label: Label

var dragging := false
var press_planet := -1
var press_pos := Vector2.ZERO
var hover_planet := -1


func setup(camera: Camera3D) -> void:
	cam = camera
	position = Vector3(0, 5000, 0)

	universe = Node3D.new()
	universe.name = "Universe"
	add_child(universe)

	_build_backdrop()
	_build_planets()
	_build_light()
	_build_ui()

	cam.position = Vector3(0, 5000, 0)
	cam.rotation = Vector3.ZERO
	cam.fov = 58.0
	cam.far = 3000.0


# ---------------- 远景星云 ----------------
func _build_backdrop() -> void:
	## 背景：阿波罗 8 号那张地出（NASA，公有领域）。用 3D 平面，才能排在球体之后。
	var quad := QuadMesh.new()
	quad.size = Vector2(560, 315)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var tex := load("res://assets/space/earthrise_169.jpg")
	if tex != null:
		mat.albedo_texture = tex
	mat.albedo_color = Color(0.86, 0.86, 0.88)
	var mi := MeshInstance3D.new()
	mi.name = "Plate"
	mi.mesh = quad
	mi.material_override = mat
	mi.position = Vector3(0, 0, -300)
	add_child(mi)


# ---------------- 星空 ----------------
func _build_stars() -> void:
	var verts := PackedVector3Array()
	var cols := PackedColorArray()

	var f := FileAccess.open("res://assets/stars.json", FileAccess.READ)
	if f != null:
		var txt := f.get_as_text()
		f.close()
		var data = JSON.parse_string(txt)
		if data is Array:
			var n: int = data.size()
			verts.resize(n)
			cols.resize(n)
			var r := 900.0
			for i in n:
				var row = data[i]
				var ra := float(row[0]) * 15.0
				var dec := float(row[1])
				var mag := float(row[2])
				var ci := float(row[3])
				var ra_r := deg_to_rad(ra)
				var de_r := deg_to_rad(dec)
				var cd := cos(de_r)
				verts[i] = Vector3(r * cd * cos(ra_r), r * sin(de_r), -r * cd * sin(ra_r))
				var t: float = clampf((7.0 - mag) / 8.0, 0.0, 1.0)
				var inten: float = 0.16 + 0.84 * pow(t, 1.8)
				var c := Color(1, 1, 1)
				if ci < 0.0:
					c = Color(0.62, 0.78, 1.0)
				elif ci < 0.55:
					c = Color(1.0, 1.0, 1.0)
				elif ci < 1.15:
					c = Color(1.0, 0.92, 0.76)
				else:
					c = Color(1.0, 0.66, 0.46)
				cols[i] = Color(c.r * inten, c.g * inten, c.b * inten, 1.0)

	if verts.size() == 0:
		return

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_COLOR] = cols

	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_POINTS, arrays)

	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled;

uniform float star_size = 4.2;

void vertex() {
	POINT_SIZE = clamp(star_size * (0.45 + COLOR.r * 1.5), 0.7, 11.0);
}

void fragment() {
	vec2 pc = POINT_COORD;
	float d = length(pc - vec2(0.5)) * 2.0;
	float a = clamp(1.0 - d, 0.0, 1.0);
	a = a * a;
	ALBEDO = COLOR.rgb * a;
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = sh

	var mi := MeshInstance3D.new()
	mi.name = "Starfield"
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	universe.add_child(mi)


# ---------------- 星球 ----------------
func _build_planets() -> void:
	for i in DEFS.size():
		var def: Dictionary = DEFS[i]
		var sphere := SphereMesh.new()
		sphere.radius = 1.0
		sphere.height = 2.0
		sphere.radial_segments = 72
		sphere.rings = 40

		var mat := ShaderMaterial.new()
		var psh := Shader.new()
		psh.code = """
shader_type spatial;
render_mode specular_disabled, cull_back, diffuse_lambert;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform bool use_normal = false;
uniform bool use_texture = true;
uniform float tex_mix = 0.15;
uniform vec3 base_color : source_color = vec3(0.42, 0.42, 0.45);
uniform float steps = 2.0;
uniform float softness = 0.88;
uniform vec3 shade_tint : source_color = vec3(0.16, 0.15, 0.20);
uniform float rim_gain = 0.0;

void fragment() {
	vec3 tx = texture(albedo_tex, UV).rgb;
	vec3 c = use_texture ? mix(base_color, tx, tex_mix) : base_color;
	ALBEDO = c;
	if (use_normal) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
		NORMAL_MAP_DEPTH = 1.0;
	}
	float rim = pow(1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), 3.0);
	EMISSION += c * rim * rim_gain;
}

void light() {
	float nl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	float q = floor(nl * steps + 0.5) / steps;
	q = mix(q, nl, softness);
	vec3 lit = mix(shade_tint, vec3(1.0), q);
	DIFFUSE_LIGHT += lit * ATTENUATION * LIGHT_COLOR / PI;
}
"""
		mat.shader = psh
		mat.set_shader_parameter("base_color", def["color"])
		mat.set_shader_parameter("tex_mix", float(def["tex_mix"]))
		var tex_path: String = def["tex"]
		if tex_path != "":
			mat.set_shader_parameter("albedo_tex", load(tex_path))
			mat.set_shader_parameter("use_texture", true)
		else:
			mat.set_shader_parameter("use_texture", false)
		var nrm: String = def["norm"]
		if nrm != "":
			mat.set_shader_parameter("normal_tex", load(nrm))
			mat.set_shader_parameter("use_normal", true)
		if def.has("shade"):
			mat.set_shader_parameter("shade_tint", def["shade"])

		var node := MeshInstance3D.new()
		node.name = "Planet_%s" % def["name"]
		node.mesh = sphere
		node.material_override = mat
		var r: float = def["radius"]
		node.scale = Vector3(r, r, r)
		node.position = def["pos"]
		node.rotation.z = deg_to_rad(float(def["tilt"]))
		universe.add_child(node)
		world_nodes.append(node)
		world_radius.append(r)
		spin.append(randf_range(0.04, 0.10) * (1.0 if i % 2 == 0 else -1.0))

		# 大气辉光
		var atmo_col: Color = def["atmo"]
		var atmo_a: float = def["atmo_a"]
		if atmo_a > 0.01:
			var atmo := MeshInstance3D.new()
			atmo.name = "Atmo_%s" % def["name"]
			var asph := SphereMesh.new()
			asph.radius = 1.0
			asph.height = 2.0
			asph.radial_segments = 48
			asph.rings = 24
			atmo.mesh = asph
			var amat := ShaderMaterial.new()
			var ash := Shader.new()
			ash.code = """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never;

uniform vec4 tint : source_color = vec4(0.5, 0.7, 1.0, 1.0);
uniform float power = 3.6;
uniform float gain = 0.3;

void fragment() {
	float f = pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), power);
	ALBEDO = tint.rgb * f * gain;
}
"""
			amat.shader = ash
			amat.set_shader_parameter("tint", atmo_col)
			amat.set_shader_parameter("gain", atmo_a * 1.15)
			atmo.material_override = amat
			atmo.scale = Vector3.ONE * 1.045
			atmo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			node.add_child(atmo)


func _build_light() -> void:
	var sun := DirectionalLight3D.new()
	sun.name = "TitleSun"
	sun.light_energy = 1.9
	sun.light_color = Color(1.0, 0.97, 0.92)
	sun.rotation = Vector3(deg_to_rad(-6.0), deg_to_rad(-14.0), 0.0)
	sun.shadow_enabled = false
	add_child(sun)

	# 背后一盏红：只在球体边缘留一道，跟界面那点红是一套。
	var rim := OmniLight3D.new()
	rim.name = "TitleRim"
	rim.light_color = Color(0.86, 0.26, 0.18)
	rim.light_energy = 6.0
	rim.omni_range = 120.0
	rim.position = Vector3(2.0, 6.0, -62.0)
	add_child(rim)

	var fill := OmniLight3D.new()
	fill.name = "TitleFill"
	fill.light_color = Color(0.55, 0.62, 0.85)
	fill.light_energy = 2.2
	fill.omni_range = 140.0
	fill.position = Vector3(-26.0, 4.0, -18.0)
	add_child(fill)


# ---------------- 界面 ----------------
func hide_ui() -> void:
	visible = false
	if is_instance_valid(ui):
		ui.visible = false



func _corner(txt: String, pos: Vector2, align: int) -> void:
	var lb := _mk_label(txt, 12, Color(0.62, 0.61, 0.59, 0.9))
	lb.position = pos
	lb.size = Vector2(260, 18)
	lb.horizontal_alignment = align
	lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(lb)

func _build_ui() -> void:
	ui = CanvasLayer.new()
	ui.name = "TitleUI"
	add_child(ui)

	var serif := FontFile.new()
	serif.load_dynamic_font("res://assets/fonts/NotoSerifSC.ttf")
	title_font = serif

	var vp := get_viewport().get_visible_rect().size
	var tag := _mk_label("M O O N D U S T   C A S E", 15, Color(0.72, 0.71, 0.69))
	tag.size = Vector2(700, 24)
	tag.position = Vector2(58, 372)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	ui.add_child(tag)

	big_title = _mk_label("月壤厢", 84, Color(0.97, 0.96, 0.94))
	big_title.add_theme_font_override("font", title_font)
	big_title.size = Vector2(760, 108)
	big_title.position = Vector2(52, 398)
	big_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	ui.add_child(big_title)

	var bar := ColorRect.new()
	bar.color = Color(0.72, 0.20, 0.14)
	bar.position = Vector2(56, 512)
	bar.size = Vector2(52, 3)
	ui.add_child(bar)

	sub_label = _mk_label("五个世界，五条路。", 20, Color(0.80, 0.78, 0.75))
	sub_label.size = Vector2(600, 30)
	sub_label.position = Vector2(56, 528)
	sub_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	ui.add_child(sub_label)

	var sub2 := _mk_label("先落完人之门。", 15, Color(0.58, 0.56, 0.54))
	sub2.size = Vector2(600, 24)
	sub2.position = Vector2(56, 558)
	sub2.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	ui.add_child(sub2)

	hint_label = _mk_label("拖拽星空 · 拖一颗星球转它 · 点一颗星，落进去", 14, Color(0.46, 0.45, 0.44))
	hint_label.position = Vector2(0, vp.y - 30)
	hint_label.size = Vector2(vp.x, 24)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ui.add_child(hint_label)

	# —— 厢的边：一圈 1px 细框，四角等宽小字 ——
	var m := 40.0
	var c_edge := Color(0.95, 0.94, 0.92, 0.16)
	for r in [Rect2(m, m, vp.x - m * 2, 1), Rect2(m, vp.y - m - 1, vp.x - m * 2, 1),
			Rect2(m, m, 1, vp.y - m * 2), Rect2(vp.x - m - 1, m, 1, vp.y - m * 2)]:
		var ln := ColorRect.new()
		ln.color = c_edge
		ln.position = r.position
		ln.size = r.size
		ln.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ui.add_child(ln)

	_corner("SLT-000   月壤厢", Vector2(m + 14, m + 10), HORIZONTAL_ALIGNMENT_LEFT)
	_corner("五界 / 已开其一", Vector2(vp.x - m - 14 - 260, m + 10), HORIZONTAL_ALIGNMENT_RIGHT)
	_corner("MOONDUST CASE · 案卷与门", Vector2(m + 14, vp.y - 33), HORIZONTAL_ALIGNMENT_LEFT)
	_corner("点一颗星落下", Vector2(vp.x - m - 14 - 260, vp.y - 33), HORIZONTAL_ALIGNMENT_RIGHT)

	# 图例：编号 + 门 + 落脚处。球下只留编号，名字放这儿，谁也不压谁。
	var lg_top := 300
	for i in DEFS.size():
		var d: Dictionary = DEFS[i]
		var line := _mk_label("%02d   %s" % [i + 1, d["name"]], 12, Color(0.90, 0.89, 0.86) if d["playable"] else Color(0.62, 0.61, 0.59))
		line.position = Vector2(vp.x - 260, lg_top + 34 * i)
		line.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
		line.add_theme_constant_override("shadow_offset_x", 1)
		line.add_theme_constant_override("shadow_offset_y", 1)
		line.size = Vector2(240, 18)
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ui.add_child(line)
		var place := _mk_label(str(d["trade"]), 10, Color(0.46, 0.45, 0.43))
		place.position = Vector2(vp.x - 260 + 36, lg_top + 34 * i + 16)
		place.size = Vector2(240, 16)
		place.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ui.add_child(place)

	for i in DEFS.size():
		var def: Dictionary = DEFS[i]
		var lb := _mk_label("%02d" % (i + 1), 12, Color(0.86, 0.85, 0.82, 0.95) if def["playable"] else Color(0.56, 0.55, 0.53))
		lb.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
		lb.add_theme_constant_override("shadow_offset_x", 1)
		lb.add_theme_constant_override("shadow_offset_y", 1)
		lb.size = Vector2(40, 16)
		lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ui.add_child(lb)
		var tr := _mk_label("", 10, Color(0.50, 0.49, 0.47))
		tr.size = Vector2(1, 1)
		ui.add_child(tr)
		labels.append(lb)
		labels.append(tr)


func _mk_label(text: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.75))
	l.add_theme_constant_override("shadow_offset_x", 1)
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l


# ---------------- 每帧 ----------------
func tick(delta: float) -> void:
	for i in world_nodes.size():
		world_nodes[i].rotate_object_local(Vector3.UP, spin[i] * delta)
	_update_labels()
	var m := get_viewport().get_mouse_position()
	hover_planet = _planet_at(m)


func _update_labels() -> void:
	for i in world_nodes.size():
		var node := world_nodes[i]
		var lb := labels[i * 2]
		var tr := labels[i * 2 + 1]
		if cam.is_position_behind(node.global_position):
			lb.visible = false
			tr.visible = false
			continue
		var sp := cam.unproject_position(node.global_position)
		var edge := cam.unproject_position(node.global_position + cam.global_transform.basis.x * world_radius[i])
		var rad: float = clampf(sp.distance_to(edge), 10.0, 320.0)
		lb.visible = true
		tr.visible = true
		var off: Vector2 = Vector2(rad + 10, -7)
		if i < label_offsets.size():
			off += label_offsets[i]
		lb.position = sp + off
		tr.position = sp + off + Vector2(0, 20)


# ---------------- 交互 ----------------
func handle_input(event: InputEvent) -> bool:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			press_pos = get_viewport().get_mouse_position()
			press_planet = _planet_at(press_pos)
			dragging = true
		else:
			if dragging:
				dragging = false
				var m := get_viewport().get_mouse_position()
				if press_planet >= 0 and m.distance_to(press_pos) < 9.0:
					picked.emit(press_planet)
			press_planet = -1
		return true

	if event is InputEventMouseMotion and dragging:
		var d: Vector2 = event.relative
		if press_planet >= 0:
			world_nodes[press_planet].rotate_object_local(Vector3.UP, -d.x * 0.009)
			world_nodes[press_planet].rotate_object_local(Vector3.RIGHT, -d.y * 0.007)
		else:
			universe.rotation.y = clampf(universe.rotation.y - d.x * 0.0032, -0.62, 0.62)
			universe.rotation.x = clampf(universe.rotation.x - d.y * 0.0026, -0.34, 0.34)
		return true

	return false


func _planet_at(m: Vector2) -> int:
	var best := -1
	var best_d := 1e9
	for i in world_nodes.size():
		var node := world_nodes[i]
		if cam.is_position_behind(node.global_position):
			continue
		var sp := cam.unproject_position(node.global_position)
		var edge := cam.unproject_position(node.global_position + cam.global_transform.basis.x * world_radius[i])
		var rad: float = maxf(14.0, sp.distance_to(edge))
		var d := sp.distance_to(m)
		if d <= rad and d < best_d:
			best_d = d
			best = i
	return best
