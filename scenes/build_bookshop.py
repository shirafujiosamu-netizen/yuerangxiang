"""旧书店：全能之门线，失业那年继承的长辈书店，还有一柜子没写完的档案。"""
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
    floor=mat('shop_floor', (0.20, 0.15, 0.10), 0.3),
    wall=mat('shop_wall', (0.42, 0.35, 0.27), 0.85),
    ceil=mat('shop_ceil', (0.16, 0.13, 0.10), 0.9),
    shelf=mat('shop_shelf', (0.24, 0.17, 0.10), 0.55),
    book=mat('book', (0.55, 0.20, 0.18), 0.8),
    book2=mat('book2', (0.16, 0.28, 0.42), 0.8),
    book3=mat('book3', (0.35, 0.38, 0.22), 0.8),
    counter=mat('shop_counter', (0.30, 0.22, 0.13), 0.5),
    metal=mat('shop_metal', (0.50, 0.45, 0.35), 0.35, 0.85),
    lamp=mat('shop_lamp', (1.0, 0.86, 0.55), 1.0, emit=6.0),
    paper=mat('shop_paper', (0.90, 0.87, 0.78), 0.9),
    sign=mat('shop_sign', (0.18, 0.12, 0.08), 0.6),
    file=mat('shop_file', (0.70, 0.66, 0.55), 0.7),
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


W, D, H = 16.0, 13.0, 4.2

box('floor', (0, 0, 0), (W, D, 0.1), M['floor'])
box('ceil', (0, 0, H), (W, D, 0.12), M['ceil'])
box('wall_back', (0, D / 2, H / 2), (W, 0.2, H), M['wall'])
box('wall_left', (-W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_right', (W / 2, 0, H / 2), (0.2, D, H), M['wall'])
box('wall_front', (0, -D / 2, H / 2), (W, 0.2, H), M['wall'])

# 书架（左右墙各一排，带书）
def shelf(x, y, facing, n=5):
    box('shelf_%d_%d' % (x, y), (x, y, 1.7), (0.5 if facing == 'side' else 2.6, 2.6 if facing == 'side' else 0.5, 3.4), M['shelf'])
    for k in range(n):
        bbox_x = x + (0.0 if facing == 'side' else -1.0 + k * 0.5)
        bbox_y = y + (-1.0 + k * 0.5 if facing == 'side' else 0.0)
        box('shelf_board_%d_%d_%d' % (x, y, k), (bbox_x, bbox_y, 0.9 + k * 0.22), (0.4, 1.8, 0.05), M['shelf'])
        for j in range(7):
            box('book_%d_%d_%d_%d' % (x, y, k, j), (bbox_x, bbox_y + (j - 3) * 0.24, 0.9 + k * 0.22 + 0.05), (0.30, 0.22, 0.34), [M['book'], M['book2'], M['book3']][j % 3])


for i in range(3):
    shelf(-W / 2 + 0.5, -4.5 + i * 3.4, 'side')
    shelf(W / 2 - 0.5, -4.5 + i * 3.4, 'side')
# 后墙一排
for i in range(3):
    shelf(-3.5 + i * 3.5, D / 2 - 0.6, 'back')

# 柜台
box('counter', (0, -1.5, 0.5), (3.0, 0.8, 1.0), M['counter'])
box('counter_top', (0, -1.5, 1.02), (3.2, 1.0, 0.06), M['shelf'])
box('cash', (0.6, -1.1, 1.1), (0.4, 0.3, 0.2), M['metal'])

# 门头牌
box('sign', (0, -D / 2 + 0.16, 2.6), (3.4, 0.06, 0.7), M['sign'])
txt('旧书店 · 档案', (0, -D / 2 + 0.24, 2.6), 0.26, M['paper'], name='t_sign')

# 档案柜（墙角，带文件盒）
box('cabinet', (-W / 2 + 1.2, D / 2 - 1.2, 1.0), (1.6, 0.7, 2.0), M['shelf'])
for i in range(3):
    box('file_%d' % i, (-W / 2 + 1.2, D / 2 - 0.9, 0.5 + i * 0.5), (1.3, 0.5, 0.28), M['file'])

# 吊灯（暖）
for i, y in enumerate((-2.0, 1.5, 4.0)):
    cyl('lamp_rod_%d' % i, (0, y, H - 0.7), 0.015, 0.5, M['metal'])
    box('lamp_%d' % i, (0, y, H - 0.5), (0.5, 0.5, 0.06), M['lamp'])

world = bpy.data.worlds.new('W')
sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.03, 0.025, 0.02, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5

for name, loc, energy, size, col in (
        ('key', (0, 0, H - 0.5), 600, 10.0, (1.0, 0.85, 0.6)),
        ('fill', (0, -3.0, H - 0.6), 260, 8.0, (0.9, 0.9, 0.95)),
        ('side_l', (-7.0, 0, H - 0.7), 200, 6.0, (1.0, 0.8, 0.6)),
        ('side_r', (7.0, 0, H - 0.7), 200, 6.0, (1.0, 0.8, 0.6)),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lt = bpy.context.object
    lt.name = name
    lt.data.energy = energy
    lt.data.size = size
    lt.data.color = col

bpy.ops.object.camera_add(location=(2.6, -6.0, 1.8))
cam = bpy.context.object
target = Vector((-1.0, 2.5, 1.2))
cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 24
sc.camera = cam

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600
sc.render.resolution_y = 1000
sc.eevee.taa_render_samples = 96
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = 0.35

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WS, 'bookshop.blend'))
sc.render.filepath = os.path.join(WS, 'bookshop-v1.png')
bpy.ops.render.render(write_still=True)
print('DONE bookshop')
