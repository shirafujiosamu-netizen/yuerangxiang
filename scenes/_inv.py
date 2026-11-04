
import bpy, json
names = [o.name for o in bpy.data.objects]
import re
wre = sorted({n.split('_')[0] for n in names})
print(json.dumps({'total':len(names),'prefixes':wre,'sample':[n for n in names if 'wreath' in n or 'ribbon' in n or 'bloom' in n][:12],'ceiling':[n for n in names if 'ceil' in n or 'lamp' in n or 'p_lamp' in n][:12]}))
