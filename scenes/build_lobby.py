"""殡仪馆综合服务大厅：服务台、路标、指示牌、墓园/焚化炉/停尸间/葬礼会堂/丧葬用品店/卫生间/餐厅入口。"""
import bpy, math, os
from mathutils import Vector

WS = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def mat(name, base, rough=0.7, metallic=0.0, emit=0.0, emit_col=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    if emit:
        b.inputs['Emission Color'].default_value = (*(emit_col or base), 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


M = {
    'floor': mat('floor_polished', (0.16, 0.155, 0.145), 0.16, 0.08),
    'floor2': mat('floor_stripe', (0.13, 0.12, 0.11), 0.22, 0.05),
    'wall': mat('wall_paint', (0.55, 0.53, 0.50), 0.85),
    'wain': mat('wainscot', (0.14, 0.12, 0.10), 0.6),
    'ceil': mat('ceiling_panel', (0.16, 0.16, 0.155), 0.9),
    'light': mat('panel_light', (1.0, 0.97, 0.90), 1.0, emit=6.0),
    'counter': mat('counter_body', (0.10, 0.09, 0.085), 0.5),
    'counter_top': mat('counter_top', (0.62, 0.58, 0.50), 0.35, 0.15),
    'metal': mat('metal', (0.35, 0.35, 0.36), 0.35, 0.85),
    'black': mat('black_plastic', (0.02, 0.02, 0.022), 0.5),
    'signface': mat('sign_face', (0.86, 0.85, 0.82), 0.5),
    'signblue': mat('sign_blue', (0.03, 0.09, 0.22), 0.5),
    'wood': mat('wood_dark', (0.09, 0.06, 0.04), 0.55),
    'green': mat('plant_green', (0.05, 0.09, 0.04), 0.8),
    'ceramic': mat('pot_ceramic', (0.55, 0.53, 0.49), 0.25),
    'red': mat('carpet_red', (0.10, 0.016, 0.016), 0.9),
    'paper': mat('paper', (0.85, 0.84, 0.80), 0.9),
    'glass': mat('glass', (0.05, 0.06, 0.07), 0.1, 0.0),
    'teal': mat('accent_teal', (0.03, 0.13, 0.13), 0.6),
}


def box(name, loc, size, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return o


def cyl(name, loc, r, depth, material, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o


font = None
for fp in ('C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf'):
    if os.path.exists(fp):
        try:
            font = bpy.data.fonts.load(fp)
            break
        except Exception:
            pass


def text(body, loc, size, material, rot=(math.radians(90), 0, 0), align='CENTER', extrude=0.004):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.data.body = body
    o.data.size = size
    o.data.align_x = align
    o.data.align_y = 'CENTER'
    o.data.extrude = extrude
    if font:
        o.data.font = font
    o.data.materials.append(material)
    return o


# ---------- 房间 ----------
W, D, H = 24.0, 18.0, 4.6
box('floor', (0, 0, 0), (W, D, 0.1), M['floor'])
# 地面分色条（引导线）
box('floor_guide_l', (-3.2, 0, 0.052), (0.16, D - 2.0, 0.01), M['floor2'])
box('floor_guide_r', (3.2, 0, 0.052), (0.16, D - 2.0, 0.01), M['floor2'])
box('ceiling', (0, 0, H), (W, D, 0.12), M['ceil'])
box('wall_back', (0, D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wall_left', (-W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_right', (W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_front', (0, -D / 2, H / 2), (W, 0.2, H), M['wall'])
# 墙裙
box('wain_back', (0, D / 2 - 0.12, 0.55), (W, 0.04, 1.1), M['wain'])
box('wain_left', (-W / 2 + 0.12, 0, 0.55), (0.04, D, 1.1), M['wain'])
box('wain_right', (W / 2 - 0.12, 0, 0.55), (0.04, D, 1.1), M['wain'])

# 天花灯带
for i, y in enumerate((-7.0, -3.5, 0.0, 3.5, 7.0)):
    box('light_band_%d' % i, (0, y, H - 0.06), (W - 2.0, 0.22, 0.05), M['light'])
# 天花格栅
for i in range(7):
    box('ceil_rib_%d' % i, (0, -8.4 + i * 2.8, H - 0.10), (W - 0.4, 0.10, 0.14), M['wain'])
bpy.ops.object.light_add(type='AREA', location=(0, -1.0, H - 0.3))
key = bpy.context.object
key.name = 'key_hall'
key.data.energy = 900
key.data.size = 12.0
key.data.color = (1.0, 0.96, 0.90)
bpy.ops.object.light_add(type='AREA', location=(0, 5.6, H - 0.4))
key2 = bpy.context.object
key2.name = 'key_back'
key2.data.energy = 420
key2.data.size = 10.0
key2.data.color = (0.92, 0.95, 1.0)

# ---------- 服务台（左侧，L 形） ----------
box('counter_front', (-6.4, 3.4, 0.56), (7.6, 0.55, 0.72), M['counter'])
box('counter_top', (-6.4, 3.4, 0.95), (7.9, 0.85, 0.07), M['counter_top'])
box('counter_wing', (-10.0, 1.2, 0.56), (0.55, 4.2, 0.72), M['counter'])
box('counter_wing_top', (-10.0, 1.2, 0.95), (0.85, 4.2, 0.07), M['counter_top'])
box('counter_lower_panel', (-6.4, 3.72, 0.30), (7.6, 0.06, 0.55), M['metal'])
text('服务台', (-6.4, 3.70, 0.66), 0.50, M['paper'])
# 台面物件：显示器、吊牌、铃
box('monitor', (-8.6, 3.1, 1.16), (0.06, 0.52, 0.34), M['black'])
box('monitor2', (-4.9, 3.1, 1.14), (0.06, 0.42, 0.30), M['black'])
box('keyboard', (-8.6, 3.5, 1.00), (0.42, 0.16, 0.03), M['black'])
cyl('bell', (-6.0, 3.5, 1.02), 0.09, 0.05, M['metal'])
box('file_stack', (-5.6, 3.62, 1.03), (0.34, 0.26, 0.10), M['paper'])
box('file_stack2', (-5.58, 3.60, 1.13), (0.32, 0.24, 0.08), M['paper'])

# 后墙业务公示板
box('board', (-6.2, D / 2 - 0.18, 2.5), (5.2, 0.06, 1.7), M['signblue'])
for i in range(5):
    box('notice_%d' % i, (-8.2 + i * 1.0, D / 2 - 0.24, 2.35 + (0.16 if i % 2 else -0.1)), (0.62, 0.02, 0.44), M['paper'])
text('业务公示', (-6.2, D / 2 - 0.30, 3.55), 0.36, M['paper'])

# ---------- 悬挂导向牌（横排，带箭头） ----------
def hang_sign(x, y, label, color, arrow=True, wide=2.45):
    z = 3.10
    box('sign_%s' % label, (x, y, z), (wide, 0.05, 0.56), color)
    text(label, (x - (0.12 if arrow else 0), y - 0.035, z), 0.26, M['paper'], extrude=0.003)
    if arrow:
        bpy.ops.mesh.primitive_cone_add(radius1=0.085, depth=0.20, location=(x + wide / 2 - 0.28, y - 0.04, z),
                                        rotation=(math.radians(-90), 0, math.radians(-90)), vertices=3)
        o = bpy.context.object
        o.name = 'arrow_%s' % label
        o.data.materials.append(M['paper'])
    for sx in (x - wide / 2 + 0.18, x + wide / 2 - 0.18):
        cyl('sign_rod_%s' % label, (sx, y, z + 0.42), 0.010, 0.84, M['metal'])


signs = [
    ('墓园', M['teal']), ('焚化炉', M['signblue']), ('停尸间', M['signblue']),
    ('葬礼会堂', M['teal']), ('丧葬用品店', M['signblue']), ('卫生间', M['teal']), ('餐厅', M['signblue']),
]
for i, (label, c) in enumerate(signs):
    hang_sign(-9.6 + i * 3.2, 0.9, label, c)

# ---------- 三个门洞（停尸间 / 葬礼会堂 / 墓园出口） ----------
def doorway(x, y, width, label, facing='front'):
    box('door_dark_%s' % label, (x, y, 1.15), (width, 0.10, 2.3), M['glass'])
    box('door_frame_l_%s' % label, (x - width / 2 - 0.08, y, 1.2), (0.16, 0.22, 2.4), M['metal'])
    box('door_frame_r_%s' % label, (x + width / 2 + 0.08, y, 1.2), (0.16, 0.22, 2.4), M['metal'])
    box('door_frame_t_%s' % label, (x, y, 2.36), (width + 0.32, 0.22, 0.16), M['metal'])
    text(label, (x, y - 0.14, 2.75), 0.26, M['paper'])


doorway(6.2, D / 2 - 0.16, 1.7, '停尸间')
doorway(-1.0, D / 2 - 0.16, 1.7, '葬礼会堂')
doorway(W / 2 - 0.16, 1.0, 1.7, '公墓')

# ---------- 等候区座椅（两排金属椅） ----------
for row, y in enumerate((-2.6, -4.9)):
    for i in range(6):
        x = -6.6 + i * 0.72
        box('chair_seat_%d_%d' % (row, i), (x, y, 0.44), (0.62, 0.58, 0.06), M['metal'])
        box('chair_back_%d_%d' % (row, i), (x, y + 0.28, 0.72), (0.62, 0.06, 0.44), M['metal'])
    box('chair_beam_%d' % row, (-4.8, y, 0.30), (4.4, 0.10, 0.08), M['metal'])
    for x in (-6.9, -2.7):
        box('chair_leg_%d_%s' % (row, x), (x, y, 0.22), (0.08, 0.5, 0.44), M['metal'])

# ---------- 绿植、饮水机、售卖机 ----------
for x, y in ((-11.2, -6.2), (11.0, -6.4), (11.0, 6.4)):
    cyl('pot', (x, y, 0.32), 0.34, 0.64, M['ceramic'])
    cyl('trunk', (x, y, 1.1), 0.06, 1.0, M['wood'])
    for k in range(5):
        a = k * 1.256
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42, segments=14, ring_count=10,
                                             location=(x + 0.28 * math.cos(a), y + 0.28 * math.sin(a), 1.62))
        o = bpy.context.object
        o.scale = (1.0, 1.0, 0.8)
        o.data.materials.append(M['green'])

box('vending', (8.6, -6.9, 1.0), (1.1, 0.8, 2.0), M['counter'])
box('vending_glass', (8.6, -6.45, 1.15), (0.9, 0.06, 1.4), M['glass'])
box('vending_light', (8.6, -6.4, 1.15), (0.86, 0.02, 1.3), M['light'])
box('dispenser', (10.4, -6.9, 1.05), (0.4, 0.36, 1.2), M['paper'])
cyl('bottle', (10.4, -6.9, 1.9), 0.12, 0.5, M['teal'])

# 楼层索引
box('index_board', (2.6, D / 2 - 0.16, 2.25), (2.6, 0.06, 1.9), M['signblue'])
for i in range(6):
    box('index_row_%d' % i, (2.6, D / 2 - 0.22, 2.85 - i * 0.26), (2.1, 0.02, 0.10), M['paper'])
text('楼层索引', (2.6, D / 2 - 0.30, 3.42), 0.30, M['paper'])

# ---------- 排队栏杆（前景） ----------
for i in range(4):
    x = -0.6 - i * 1.9
    cyl('post_%d' % i, (x, -5.0, 0.52), 0.045, 1.0, M['metal'])
    cyl('post_base_%d' % i, (x, -5.0, 0.03), 0.20, 0.06, M['metal'])
    if i < 3:
        box('belt_%d' % i, (x - 0.95, -5.0, 0.92), (1.86, 0.03, 0.05), M['counter'])
for i in range(3):
    cyl('post2_%d' % i, (-0.6 - (i + 1) * 1.9 - 0.95, -3.0, 0.52), 0.045, 1.0, M['metal'])

# 花圈陈列（右侧墙）
for i in range(3):
    x = 9.0
    box('wreath_stand_%d' % i, (x, 0.2 + i * 0.9, 0.9), (0.08, 0.08, 1.8), M['metal'])
    for k in range(16):
        a = 2 * math.pi * k / 16
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075, segments=10, ring_count=8,
                                             location=(x, 0.2 + i * 0.9 + 0.34 * math.cos(a), 1.75 + 0.34 * math.sin(a)))
        o = bpy.context.object
        o.data.materials.append(M['paper'] if k % 3 else M['green'])

# ---------- 时钟 + 门厅立柱 ----------
cyl('clock', (-11.2, D / 2 - 0.30, 3.30), 0.36, 0.06, M['paper'], rot=(math.radians(90), 0, 0))
for x in (-12.0, 12.0):
    box('pillar_%s' % x, (x, -1.2, H / 2), (0.4, 0.4, H), M['wall'])

# ---------- 世界与相机 ----------
world = bpy.data.worlds.new('W')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.021, 0.024, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

bpy.ops.object.camera_add(location=(3.2, -8.0, 1.80))
cam = bpy.context.object
target = Vector((-0.9, 3.0, 1.66))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 19
sc.camera = cam

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.render.film_transparent = False
sc.eevee.taa_render_samples = 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.15

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WS, 'lobby.blend'))
sc.render.filepath = os.path.join(WS, 'lobby-v1.png')
bpy.ops.render.render(write_still=True)
print('DONE lobby')
