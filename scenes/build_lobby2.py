"""殡仪馆综合服务大厅 v2：亮场，每个门上方挂牌，吊牌只指真实方向。"""
import bpy, math, os
from mathutils import Vector

WS = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def mat(name, base, rough=0.7, metallic=0.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    if emit:
        b.inputs['Emission Color'].default_value = (*base, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


M = dict(
    floor=mat('floor_polished', (0.42, 0.40, 0.37), 0.22, 0.04),
    tile=mat('floor_tile', (0.30, 0.29, 0.27), 0.24, 0.04),
    wall=mat('wall_paint', (0.72, 0.70, 0.66), 0.85),
    wain=mat('wainscot', (0.20, 0.17, 0.14), 0.6),
    ceil=mat('ceiling_panel', (0.60, 0.60, 0.58), 0.9),
    light=mat('panel_light', (1.0, 0.98, 0.94), 1.0, emit=5.0),
    counter=mat('counter_body', (0.13, 0.11, 0.10), 0.5),
    counter_top=mat('counter_top', (0.72, 0.68, 0.58), 0.32, 0.12),
    metal=mat('metal', (0.48, 0.48, 0.50), 0.32, 0.85),
    black=mat('black_plastic', (0.03, 0.03, 0.032), 0.5),
    signface=mat('sign_face', (0.92, 0.91, 0.88), 0.45),
    signblue=mat('sign_blue', (0.05, 0.14, 0.32), 0.45),
    signgreen=mat('sign_green', (0.03, 0.20, 0.19), 0.45),
    wood=mat('wood_dark', (0.12, 0.08, 0.05), 0.55),
    green=mat('plant_green', (0.06, 0.13, 0.05), 0.8),
    ceramic=mat('pot_ceramic', (0.62, 0.60, 0.56), 0.25),
    carpet=mat('carpet_red', (0.16, 0.03, 0.03), 0.9),
    paper=mat('paper', (0.93, 0.92, 0.88), 0.9),
    dark=mat('dark_frame', (0.06, 0.06, 0.07), 0.4),
)


def box(name, loc, size, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return o


def cyl(name, loc, r, depth, material, rot=(0, 0, 0), verts=28):
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


def txt(body, loc, size, material, rot=(math.radians(90), 0, 0), extrude=0.003, name=None):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.object
    if name:
        o.name = name
    o.data.body = body
    o.data.size = size
    o.data.align_x = 'CENTER'
    o.data.align_y = 'CENTER'
    o.data.extrude = extrude
    if font:
        o.data.font = font
    o.data.materials.append(material)
    return o


W, D, H = 26.0, 20.0, 4.8

# ---------------- 房间 ----------------
box('floor', (0, 0, 0), (W, D, 0.1), M['floor'])
for i in range(13):
    for j in range(10):
        box('tile_%d_%d' % (i, j), (-W / 2 + 1 + i * 2, -D / 2 + 1 + j * 2, 0.055), (1.96, 1.96, 0.01), M['tile'])
box('carpet_run', (0, 1.0, 0.062), (5.0, 13.0, 0.012), M['carpet'])
box('ceiling', (0, 0, H), (W, D, 0.12), M['ceil'])
box('wall_back', (0, D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wall_left', (-W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_right', (W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_front', (0, -D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wain_back', (0, D / 2 - 0.12, 0.6), (W, 0.04, 1.2), M['wain'])
box('wain_left', (-W / 2 + 0.12, 0, 0.6), (0.04, D, 1.2), M['wain'])
box('wain_right', (W / 2 - 0.12, 0, 0.6), (0.04, D, 1.2), M['wain'])

for i, y in enumerate((-7.0, -3.5, 0.0, 3.5, 7.0)):
    box('light_band_%d' % i, (0, y, H - 0.08), (W - 3.0, 0.28, 0.05), M['light'])
for i in range(8):
    box('ceil_rib_%d' % i, (0, -8.6 + i * 2.45, H - 0.12), (W - 0.4, 0.09, 0.16), M['wain'])

for name, loc, energy, size, col in (
        ('key_hall', (0, -2.0, H - 0.35), 1500, 14.0, (1.0, 0.97, 0.93)),
        ('key_back', (0, 6.0, H - 0.4), 900, 11.0, (0.95, 0.97, 1.0)),
        ('side_l', (-11.0, 0, H - 0.6), 500, 8.0, (1.0, 0.96, 0.90)),
        ('side_r', (11.0, 0, H - 0.6), 500, 8.0, (1.0, 0.96, 0.90)),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lt = bpy.context.object
    lt.name = name
    lt.data.energy = energy
    lt.data.size = size
    lt.data.color = col

# ---------------- 服务台 ----------------
box('counter_front', (-7.6, 4.4, 0.56), (8.4, 0.55, 0.72), M['counter'])
box('counter_top', (-7.6, 4.4, 0.95), (8.7, 0.9, 0.07), M['counter_top'])
box('counter_wing', (-11.6, 2.0, 0.56), (0.55, 4.2, 0.72), M['counter'])
box('counter_wing_top', (-11.6, 2.0, 0.95), (0.9, 4.2, 0.07), M['counter_top'])
box('counter_kick', (-7.6, 4.74, 0.28), (8.4, 0.06, 0.5), M['metal'])
box('counter_sign', (-7.6, 4.72, 0.70), (3.4, 0.03, 0.42), M['signblue'])
txt('服务台', (-7.6, 4.69, 0.70), 0.30, M['paper'], name='t_counter')
box('monitor', (-9.8, 4.1, 1.14), (0.06, 0.52, 0.34), M['black'])
box('monitor2', (-6.0, 4.1, 1.12), (0.06, 0.44, 0.30), M['black'])
box('keyboard', (-9.8, 4.5, 1.00), (0.44, 0.16, 0.03), M['black'])
cyl('bell', (-7.2, 4.5, 1.02), 0.09, 0.05, M['metal'])
box('files', (-7.0, 4.62, 1.04), (0.34, 0.26, 0.10), M['paper'])
box('chair_office', (-9.4, 5.1, 0.55), (0.55, 0.55, 0.6), M['dark'])

# 公示板 + 楼层索引
box('board', (-W / 2 + 0.20, 6.6, 2.55), (0.06, 5.0, 1.5), M['signblue'])
txt('业务公示', (-W / 2 + 0.34, 6.6, 3.5), 0.26, M['paper'], rot=(math.radians(90), 0, math.radians(90)), name='t_board')
for i in range(4):
    box('notice_%d' % i, (-W / 2 + 0.26, 5.2 + i * 1.05, 2.42 + (0.12 if i % 2 else -0.10)), (0.02, 0.66, 0.48), M['paper'])


# ---------------- 门 + 门头牌 ----------------
def door(name, pos, facing, width=1.8, sign_color=None):
    """facing: 'back' | 'left' | 'right' | 'front'"""
    x, y, _ = pos
    if facing in ('back', 'front'):
        box('door_%s' % name, (x, y, 1.15), (width, 0.12, 2.3), M['dark'])
        box('df_l_%s' % name, (x - width / 2 - 0.09, y, 1.2), (0.18, 0.24, 2.4), M['metal'])
        box('df_r_%s' % name, (x + width / 2 + 0.09, y, 1.2), (0.18, 0.24, 2.4), M['metal'])
        box('df_t_%s' % name, (x, y, 2.38), (width + 0.36, 0.24, 0.18), M['metal'])
        sy = y - (0.16 if facing == 'back' else -0.16)
        box('ds_%s' % name, (x, sy, 2.86), (width + 0.5, 0.06, 0.46), sign_color)
        txt(name, (x, sy - (0.04 if facing == 'back' else -0.04), 2.86), 0.26, M['paper'], name='t_%s' % name)
    else:
        box('door_%s' % name, (x, y, 1.15), (0.12, width, 2.3), M['dark'])
        box('df_l_%s' % name, (x, y - width / 2 - 0.09, 1.2), (0.24, 0.18, 2.4), M['metal'])
        box('df_r_%s' % name, (x, y + width / 2 + 0.09, 1.2), (0.24, 0.18, 2.4), M['metal'])
        box('df_t_%s' % name, (x, y, 2.38), (0.24, width + 0.36, 0.18), M['metal'])
        sx = x - (0.16 if facing == 'right' else -0.16)
        box('ds_%s' % name, (sx, y, 2.86), (0.06, width + 0.5, 0.46), sign_color)
        txt(name, (sx - (0.04 if facing == 'right' else -0.04), y, 2.86), 0.26, M['paper'],
            rot=(math.radians(90), 0, math.radians(-90) if facing == 'right' else math.radians(90)),
            name='t_%s' % name)


door('停尸间', (-8.4, D / 2 - 0.18, 0), 'back', sign_color=M['signblue'])
door('葬礼会堂', (0.0, D / 2 - 0.18, 0), 'back', width=2.2, sign_color=M['signgreen'])
door('焚化炉', (8.4, D / 2 - 0.18, 0), 'back', sign_color=M['signblue'])
door('墓园', (-W / 2 + 0.18, -3.0, 0), 'left', sign_color=M['signgreen'])
door('丧葬用品店', (W / 2 - 0.18, -4.4, 0), 'right', sign_color=M['signblue'])
door('卫生间', (W / 2 - 0.18, 0.4, 0), 'right', sign_color=M['signgreen'])
door('餐厅', (W / 2 - 0.18, 5.0, 0), 'right', sign_color=M['signblue'])

# ---------------- 吊牌：只指真实方向 ----------------
def hung(x, y, label, arrow, color, wide=3.0):
    z = 3.15
    box('hs_%s' % label, (x, y, z), (wide, 0.06, 0.60), color)
    txt(label, (x - (0.16 if arrow else 0), y - 0.045, z), 0.28, M['paper'], name='t_hs_%s' % label)
    if arrow:
        rot = (math.radians(-90), 0, math.radians(-90) if arrow == '>' else math.radians(90))
        ax = x + (wide / 2 - 0.32) * (1 if arrow == '>' else -1)
        bpy.ops.mesh.primitive_cone_add(radius1=0.10, depth=0.24, location=(ax, y - 0.05, z), rotation=rot, vertices=3)
        o = bpy.context.object
        o.name = 'ha_%s' % label
        o.data.materials.append(M['paper'])
    for sx in (x - wide / 2 + 0.2, x + wide / 2 - 0.2):
        cyl('hr_%s' % label, (sx, y, z + 0.44), 0.010, 0.88, M['metal'])


hung(-4.6, 1.2, '墓园 出口', '<', M['signgreen'], wide=3.0)
hung(3.6, 1.2, '丧葬用品店 · 卫生间 · 餐厅', '>', M['signblue'], wide=5.0)

# ---------------- 等候区 ----------------
for row, y in enumerate((-3.4, -5.6)):
    for i in range(6):
        x = -6.0 + i * 0.72
        box('seat_%d_%d' % (row, i), (x, y, 0.44), (0.62, 0.58, 0.06), M['metal'])
        box('back_%d_%d' % (row, i), (x, y + 0.28, 0.72), (0.62, 0.06, 0.44), M['metal'])
    box('beam_%d' % row, (-4.2, y, 0.30), (4.4, 0.10, 0.08), M['metal'])
    for x in (-6.3, -2.1):
        box('leg_%d_%s' % (row, x), (x, y, 0.22), (0.08, 0.5, 0.44), M['metal'])

# ---------------- 绿植 / 饮水机 / 售卖机 ----------------
for x, y in ((-11.4, -7.6), (11.2, -7.6), (11.2, 7.6), (-11.4, 7.6)):
    cyl('pot', (x, y, 0.34), 0.36, 0.68, M['ceramic'])
    cyl('trunk', (x, y, 1.15), 0.06, 1.0, M['wood'])
    for k in range(6):
        a = k * 1.047
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.44, segments=14, ring_count=10,
                                            location=(x + 0.3 * math.cos(a), y + 0.3 * math.sin(a), 1.75))
        o = bpy.context.object
        o.scale = (1.0, 1.0, 0.8)
        o.data.materials.append(M['green'])

box('vending', (9.2, -8.2, 1.0), (1.2, 0.8, 2.0), M['counter'])
box('vending_glass', (9.2, -7.76, 1.2), (0.95, 0.06, 1.4), M['signblue'])
box('vending_light', (9.2, -7.72, 1.2), (0.9, 0.02, 1.3), M['light'])
box('dispenser', (11.0, -8.2, 1.05), (0.42, 0.38, 1.25), M['paper'])
cyl('bottle', (11.0, -8.2, 1.95), 0.13, 0.5, M['signgreen'])

# 排队栏杆
for i in range(4):
    x = 1.6 - i * 1.9
    cyl('post_%d' % i, (x, -6.2, 0.52), 0.045, 1.0, M['metal'])
    cyl('post_base_%d' % i, (x, -6.2, 0.03), 0.20, 0.06, M['metal'])
    if i < 3:
        box('belt_%d' % i, (x - 0.95, -6.2, 0.92), (1.86, 0.03, 0.05), M['dark'])

# 花圈陈列
for i in range(3):
    x = 9.6
    y = 0.6 + i * 1.05
    box('wstand_%d' % i, (x, y, 0.9), (0.08, 0.08, 1.8), M['metal'])
    for k in range(16):
        a = 2 * math.pi * k / 16
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.078, segments=10, ring_count=8,
                                            location=(x, y + 0.34 * math.cos(a), 1.75 + 0.34 * math.sin(a)))
        o = bpy.context.object
        o.data.materials.append(M['paper'] if k % 3 else M['green'])

# 时钟
cyl('clock', (-4.2, D / 2 - 0.30, 3.45), 0.36, 0.06, M['paper'], rot=(math.radians(90), 0, 0))

# ---------------- 世界 / 相机 ----------------
world = bpy.data.worlds.new('W')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.10, 0.10, 0.11, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55

bpy.ops.object.camera_add(location=(2.4, -8.8, 1.92))
cam = bpy.context.object
target = Vector((-3.4, 2.8, 1.68))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 20
sc.camera = cam

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.eevee.taa_render_samples = 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.45

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WS, 'lobby2.blend'))
sc.render.filepath = os.path.join(WS, 'lobby-v2.png')
bpy.ops.render.render(write_still=True)
print('DONE lobby2')
