"""赌场场景：暗金暖调、绿呢赌桌、吧台、霓虹字。玩家 demo 收尾走进去的那间。"""
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
    floor=mat('cas_floor', (0.10, 0.08, 0.07), 0.3),
    carpet=mat('cas_carpet', (0.11, 0.02, 0.02), 0.9),
    wall=mat('cas_wall', (0.16, 0.12, 0.10), 0.85),
    ceil=mat('cas_ceil', (0.07, 0.06, 0.06), 0.9),
    felt=mat('cas_felt', (0.06, 0.38, 0.24), 0.5),
    wood=mat('cas_wood', (0.20, 0.13, 0.07), 0.5),
    wood_dark=mat('cas_wood_dark', (0.10, 0.06, 0.03), 0.55),
    metal=mat('cas_metal', (0.5, 0.42, 0.26), 0.32, 0.9),      # 黄铜
    brass=mat('cas_brass', (0.62, 0.50, 0.24), 0.25, 0.95),
    chip_r=mat('chip_red', (0.75, 0.12, 0.10), 0.35),
    chip_b=mat('chip_blue', (0.10, 0.30, 0.70), 0.35),
    chip_g=mat('chip_green', (0.10, 0.55, 0.30), 0.35),
    chip_k=mat('chip_black', (0.05, 0.05, 0.06), 0.35),
    neon=mat('cas_neon', (1.0, 0.35, 0.15), 1.0, emit=5.0),    # 橙红霓虹
    neon_b=mat('cas_neon_b', (0.2, 0.7, 1.0), 1.0, emit=4.5),
    light=mat('cas_lamp', (1.0, 0.86, 0.62), 1.0, emit=6.0),
    black=mat('cas_black', (0.02, 0.02, 0.025), 0.4),
    paper=mat('cas_paper', (0.93, 0.90, 0.82), 0.9),
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


def sph(name, loc, r, material, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
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


W, D, H = 20.0, 16.0, 5.0

# 房间
box('floor', (0, 0, 0), (W, D, 0.1), M['floor'])
box('carpet', (0, 0.5, 0.055), (7.5, 11.0, 0.01), M['carpet'])
box('ceil', (0, 0, H), (W, D, 0.12), M['ceil'])
box('wall_back', (0, D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wall_left', (-W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_right', (W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_front', (0, -D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wain_back', (0, D / 2 - 0.12, 0.75), (W, 0.04, 1.5), M['wood_dark'])
box('wain_left', (-W / 2 + 0.12, 0, 0.75), (0.04, D, 1.5), M['wood_dark'])
box('wain_right', (W / 2 - 0.12, 0, 0.75), (0.04, D, 1.5), M['wood_dark'])

# 吊灯（暖光球）沿中轴一排
for i, y in enumerate((-3.5, 0.0, 3.5)):
    cyl('lamp_rod_%d' % i, (0, y, H - 1.0), 0.015, 0.6, M['metal'])
    sph('lamp_%d' % i, (0, y, H - 1.5), 0.30, M['light'])

# 背墙霓虹字：赌
box('neon_sign', (0, D / 2 - 0.16, 3.2), (3.4, 0.06, 1.1), M['black'])
txt('赌', (0, D / 2 - 0.24, 3.2), 0.9, M['neon'], name='t_du')

# 三张绿呢赌桌（圆形）
def table(cx, cy, rad=1.55):
    cyl('tleg_%d_%d' % (cx, cy), (cx, cy, 0.42), 0.10, 0.84, M['wood_dark'])
    box('tfoot_%d_%d' % (cx, cy), (cx, cy, 0.05), (0.9, 0.9, 0.1), M['wood_dark'])
    cyl('ttop_%d_%d' % (cx, cy), (cx, cy, 0.86), rad, 0.08, M['wood'])
    cyl('tfelt_%d_%d' % (cx, cy), (cx, cy, 0.905), rad - 0.22, 0.02, M['felt'])
    # 筹码堆
    for k in range(6):
        a = 2 * math.pi * k / 6
        sph('chip_%d_%d_%d' % (cx, cy, k), (cx + 0.75 * math.cos(a), cy + 0.75 * math.sin(a), 0.96), 0.09,
            [M['chip_r'], M['chip_b'], M['chip_g'], M['chip_k']][k % 4])


def table_light(cx, cy):
    cyl('tl_rod_%d_%d' % (cx, cy), (cx, cy, H - 0.9), 0.012, 0.5, M['metal'])
    sph('tl_%d_%d' % (cx, cy), (cx, cy, H - 1.25), 0.16, M['light'])

table(-2.6, 0.6); table_light(-2.6, 0.6)
table(2.6, 0.6); table_light(2.6, 0.6)
table(0.0, -3.6); table_light(0.0, -3.6)

# 吧台（右墙）
box('bar_front', (W / 2 - 1.4, 4.6, 0.56), (0.5, 7.0, 0.72), M['wood_dark'])
box('bar_top', (W / 2 - 1.4, 4.6, 0.95), (0.9, 7.2, 0.07), M['wood'])
# 酒架
box('shelf', (W / 2 - 0.5, 4.6, 2.0), (0.30, 7.0, 1.3), M['wood_dark'])
for i in range(2):
    box('shelf_plank_%d' % i, (W / 2 - 0.5, 4.6, 1.7 + i * 0.6), (0.32, 7.0, 0.06), M['wood'])
for i in range(10):
    y = 2.2 + (i % 5) * 1.0
    z = 1.7 + (i // 5) * 0.6
    cyl('bottle_%d' % i, (W / 2 - 0.5, y, z + 0.15), 0.06, 0.34, [M['chip_g'], M['chip_b'], M['neon_b']][i % 3])

# 老虎机一排（左墙）
for i in range(3):
    y = -5.0 + i * 1.1
    box('slot_%d' % i, (-W / 2 + 0.55, y, 0.85), (0.9, 0.7, 1.7), M['black'])
    box('slot_face_%d' % i, (-W / 2 + 0.08, y, 1.2), (0.03, 0.6, 0.8), M['neon_b'])

# 后墙门（VIP）
box('door', (0, D / 2 - 0.14, 1.15), (1.8, 0.12, 2.3), M['wood_dark'])
box('door_l', (0 - 1.0, D / 2 - 0.18, 1.2), (0.18, 0.2, 2.4), M['metal'])
box('door_r', (0 + 1.0, D / 2 - 0.18, 1.2), (0.18, 0.2, 2.4), M['metal'])
txt('贵宾厅', (0, D / 2 - 0.26, 2.55), 0.22, M['neon'], name='t_vip')

# 前墙门（回大厅）
box('door_f', (0, -D / 2 + 0.14, 1.15), (1.8, 0.12, 2.3), M['wood_dark'])
txt('大厅', (0, -D / 2 + 0.24, 2.55), 0.22, M['paper'], name='t_hall')

# 世界 / 灯光 / 相机
world = bpy.data.worlds.new('W')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.02, 0.025, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5

for name, loc, energy, size, col in (
        ('key', (0, 0, H - 0.6), 700, 12.0, (1.0, 0.85, 0.62)),
        ('fill', (0, -4.0, H - 0.8), 260, 9.0, (0.9, 0.9, 1.0)),
        ('side_l', (-9.0, 0, H - 0.8), 200, 7.0, (1.0, 0.8, 0.6)),
        ('side_r', (9.0, 0, H - 0.8), 200, 7.0, (1.0, 0.8, 0.6)),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lt = bpy.context.object
    lt.name = name
    lt.data.energy = energy
    lt.data.size = size
    lt.data.color = col

bpy.ops.object.camera_add(location=(2.8, -7.0, 1.7))
cam = bpy.context.object
target = Vector((-1.2, 2.8, 1.15))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 24
sc.camera = cam

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.eevee.taa_render_samples = 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.4

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WS, 'casino.blend'))
sc.render.filepath = os.path.join(WS, 'casino-v1.png')
bpy.ops.render.render(write_still=True)
print('DONE casino')
