"""大学阶梯教室：九月开学，主角在这里第一次见到未型。明亮、白昼。"""
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
    floor=mat('uni_floor', (0.60, 0.58, 0.54), 0.3),
    wall=mat('uni_wall', (0.86, 0.85, 0.82), 0.85),
    ceil=mat('uni_ceil', (0.90, 0.90, 0.88), 0.9),
    wood=mat('uni_wood', (0.42, 0.30, 0.18), 0.5),
    wood_dark=mat('uni_wood_dark', (0.22, 0.15, 0.09), 0.55),
    seat=mat('uni_seat', (0.20, 0.30, 0.42), 0.6),      # 蓝座椅
    blackboard=mat('uni_board', (0.06, 0.16, 0.12), 0.5),
    chalk=mat('uni_chalk', (0.92, 0.92, 0.90), 0.9),
    metal=mat('uni_metal', (0.55, 0.55, 0.56), 0.35, 0.85),
    light=mat('uni_light', (1.0, 0.97, 0.92), 1.0, emit=5.0),
    paper=mat('uni_paper', (0.95, 0.94, 0.90), 0.9),
    glass=mat('uni_glass', (0.75, 0.86, 0.95), 0.1),
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


def txt(body, loc, size, material, rot=(math.radians(90), 0, 0), extrude=0.002, name=None):
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


W, D, H = 20.0, 14.0, 5.0

# 房间（明亮）
box('floor', (0, 0, 0), (W, D, 0.1), M['floor'])
box('ceil', (0, 0, H), (W, D, 0.12), M['ceil'])
box('wall_back', (0, D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wall_left', (-W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_right', (W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_front', (0, -D / 2, H / 2), (W, 0.2, H), M['wall'])

# 左墙高窗（采光）
for i in range(3):
    y = -3.5 + i * 3.4
    box('win_%d' % i, (-W / 2 + 0.10, y, 3.0), (0.04, 2.2, 1.6), M['glass'])

# 吊灯
for i, y in enumerate((-3.0, 0.0, 3.0)):
    cyl('lamp_rod_%d' % i, (0, y, H - 0.7), 0.015, 0.6, M['metal'])
    box('lamp_%d' % i, (0, y, H - 0.5), (1.8, 0.4, 0.08), M['light'])

# 黑板（后墙）
box('board', (0, D / 2 - 0.14, 2.0), (6.0, 0.05, 2.2), M['blackboard'])
txt('宗教现象学', (0, D / 2 - 0.22, 2.0), 0.4, M['chalk'], name='t_lecture')
box('board_ledge', (0, D / 2 - 0.20, 0.92), (6.2, 0.12, 0.06), M['wood'])

# 讲台 + 讲桌
box('podium', (0, 3.6, 0.16), (3.0, 2.0, 0.32), M['wood'])
box('lectern', (0, 4.2, 0.6), (0.9, 0.6, 1.1), M['wood_dark'])
box('lectern_top', (0, 4.2, 1.16), (0.95, 0.65, 0.04), M['wood'])

# 阶梯座（5 排，往后逐级抬高）
for row in range(6):
    y = 0.2 + row * 1.7            # 越往后越靠近后墙? 往前台方向
    z_step = 0.08 + row * 0.26
    box('step_%d' % row, (0, y, z_step / 2), (12.0, 1.5, z_step), M['wood_dark'])
    box('bench_%d' % row, (0, y, z_step + 0.42), (12.0, 0.55, 0.08), M['wood'])
    box('back_%d' % row, (0, y, z_step + 0.68), (12.0, 0.08, 0.5), M['wood'])

# 侧墙门（入口）
box('door_l', (-W / 2 + 0.14, -5.2, 1.15), (0.12, 1.6, 2.3), M['wood_dark'])
box('door_r', (W / 2 - 0.14, -5.2, 1.15), (0.12, 1.6, 2.3), M['wood_dark'])

# 世界 / 灯光 / 相机
world = bpy.data.worlds.new('W')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.62, 0.66, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7

for name, loc, energy, size, col in (
        ('key', (0, 0, H - 0.5), 900, 12.0, (1.0, 0.98, 0.94)),
        ('win_l', (-9.0, -1.5, 3.0), 500, 7.0, (0.85, 0.92, 1.0)),
        ('fill', (0, 5.0, H - 0.6), 400, 10.0, (0.95, 0.96, 1.0)),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lt = bpy.context.object
    lt.name = name
    lt.data.energy = energy
    lt.data.size = size
    lt.data.color = col

bpy.ops.object.camera_add(location=(-3.2, -6.2, 2.2))
cam = bpy.context.object
target = Vector((0.0, 3.0, 1.6))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 26
sc.camera = cam

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.eevee.taa_render_samples = 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.3

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WS, 'university.blend'))
sc.render.filepath = os.path.join(WS, 'university-v1.png')
bpy.ops.render.render(write_still=True)
print('DONE university')
