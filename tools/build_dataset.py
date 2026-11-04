# -*- coding: utf-8 -*-
"""把 OC 云端档案转成 demo 数据集：稀有度/产出/污染/赌场相关字段补全。
数据源：data/oc_raw.json（来自服务器 data-4phellite3.json，2026-10-22 拉取）"""
import json, io, re

raw = json.load(io.open(r'F:\job\oc-game\data\oc_raw.json', encoding='utf-8'))
wid = {w['id']: w['name'] for w in raw['worlds']}

def rarity_of(oc):
    """分级 -> 稀有度。END-1 最稀；DISASTER-OC 事件限定；无分级按 archetype 兜底"""
    arch = (oc.get('archetype') or '')
    bg = (oc.get('background') or '')
    m = re.search(r'END-(\d)', arch + ' ' + bg)
    if 'DISASTER' in arch.upper():
        return 'DISASTER'
    if m:
        n = int(m.group(1))
        return {1: 'SSR', 2: 'SR', 3: 'R'}.get(n, 'R')
    if '邪神' in arch or '神' in arch:
        return 'SR'
    if '主教' in arch or '祭司' in arch:
        return 'SR'
    return 'R'

def yield_of(oc):
    """产出倾向：月壤厢=档案/描述体系；黄昏之门=信仰/情绪体系；其余混合"""
    world = wid.get(oc.get('worldId'), '')
    if '月壤厢' in world: return 'desc'
    if '黄昏之门' in world: return 'mood'
    return 'both'

def pollution_of(oc):
    """污染速率基准：分级越高越危险；DISASTER 最高"""
    r = rarity_of(oc)
    return {'SSR': 3, 'SR': 2, 'R': 1, 'DISASTER': 5}.get(r, 1)

units = []
for o in raw['ocs']:
    r = rarity_of(o)
    units.append({
        'id': o['id'],
        'name': o.get('name', ''),
        'world': wid.get(o.get('worldId'), ''),
        'archetype': o.get('archetype', ''),
        'rarity': r,
        'trait': o.get('trait', ''),
        'hook': o.get('hook', ''),
        'bg': o.get('background', ''),
        'quotes': o.get('quotes', []),
        'color': o.get('color', '') or '#8a8f98',
        'yield': yield_of(o),
        'yieldRate': {'SSR': 3, 'SR': 2, 'R': 1, 'DISASTER': 4}.get(r, 1),
        'pollution': pollution_of(o),
    })

out = {
    'meta': {
        'source': 'data-4phellite3.json',
        'exportedAt': raw.get('updatedAt'),
        'worlds': [{'id': w['id'], 'name': w['name'], 'desc': w.get('desc', ''),
                    'chronicle': w.get('chronicle', '')} for w in raw['worlds']],
        'unitCount': len(units),
    },
    'units': units,
}
io.open(r'F:\job\oc-game\data\oc_dataset.json', 'w', encoding='utf-8').write(
    json.dumps(out, ensure_ascii=False, indent=1))

from collections import Counter
print('units:', len(units))
print('rarity:', dict(Counter(u['rarity'] for u in units)))
print('yield:', dict(Counter(u['yield'] for u in units)))
print('by world:', dict(Counter(u['world'] for u in units)))
