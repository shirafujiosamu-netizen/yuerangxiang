# 月壤厢（原《黄昏之门》）

Godot 4.7.2 工程。双击 `build\黄昏之门.exe` 直接玩，或者 `运行.bat` 用引擎跑。

## 操作

- `WASD` 走，按住右键拖转视角
- 左键点门面（服务台、赌桌、赌场里看得见的东西）
- `1` 大厅 / `2` 赌场 / `3` 大学 / `4` 旧书店，或者右下角三颗按钮
- `Esc` 关面板 / 回大厅

## 玩法闭环

标题（五颗星球，拖着星空一起转）→ 点完人之门进大厅 → 服务台接单 → 五道工序（收尸 / 洗身 / 穿衣 / 念辞 / 出殡）→ 结算 → 打烊 → 七日结账。

- 资源：**钱**、**口碑**（街坊 / 同业 / 官方三群）、**时辰**（一天 6 格）。
- 暗线：奇死那单可在收尸时「顺手刮点东西」，攒够 3 次上供，未型（Eidos）现身，收尾到赌场做托。
- 赌场：押大押小，三同通杀，一注 ¥100。当托放水时客人赢，赌场抽你六成注。

## 文件

| 路径 | 内容 |
| --- | --- |
| `main.gd` | 界面、场景切换、热点、所有面板 |
| `title3d.gd` | 3D 星空标题屏（星表 + 五颗星球） |
| `src/game.gd` | 纯逻辑：案卷、工序、结算、赌桌（不依赖 UI） |
| `tests/test_game.gd` | headless 单测，51 条 |
| `assets/*.glb` | 四个场景（大厅 / 赌场 / 大学 / 旧书店） |
| `assets/planets/` | 星球贴图（套色版画风） |
| `assets/stars.json` | 9,982 颗星（HYG v4.2，mag ≤ 6.6） |
| `audio/` | 程序化音效（环境、点击、进账、尸变） |
| `tools/gen_planets_ink.py` | 生成星球贴图 |
| `tools/gen_moon.py` | 月亮反照率 + 法线图 |

## 测试与打包

```
# 单测
Godot_v4.7.2-stable_win64.exe --headless --path . --script res://tests/test_game.gd

# 打包
Godot_v4.7.2-stable_win64.exe --headless --path . --export-release "Windows Desktop" build/黄昏之门.exe

# 截图（必须窗口化，--headless 不渲染）
Godot_v4.7.2-stable_win64.exe --path . --resolution 1440x900 -- --shot12
```

截图参数：`--shot` 标题、`--shot2` 门面卡、`--shot3` 设置、`--shot4/5` 工作台、`--shot6` 七日结账、`--shot7` 赌场、`--shot9` 标题侧转、`--shot10/11` 大学/书店、`--shot12/13` 赌桌（含下注）、`--shot14` 未型收尾。

## 还缺

- 大学、旧书店只有场景，没有玩法。
- 未知信仰的星球还是灰占位。
- 势宗面馆、壹祖寺庙、未知信仰酒馆三条线没做。
