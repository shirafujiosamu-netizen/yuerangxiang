# 交接 prompt（直接整段复制给下一个 AI）

你在接手一个 Unity 卡牌叙事游戏「月壤箱」（原「月壤厢」，已全量改名，别再写厢）。

## 工程
- 路径 `F:\job\oc-game\unity`，Unity 2022.3.62f3c1（中国版），Library 是指向 `C:\Temp\ocgame-library` 的 junction。
- 编辑器只有窗口获得焦点时才导入/编译；批处理请用 `-projectPath` 启动后等 3 分钟再判断。
- 验证一律两条：`grep -i "error CS" C:\Users\33633\AppData\Local\Unity\Editor\Editor.log` 必须为空；再用游戏内截图 `F:/job/oc-game/unity/_shots/*.png` 核对（`menu_full.png` 为主菜单，`card_full.png` 为卡桌）。

## 代码结构（Assets/Scripts）
- `GameState.cs` 607 行：规则层。时辰、怨气 grudge、案卷池、五道工序、Settle/EndDay、七日账、赌场、大学、三档存档 `SlotPath(i)` / `SlotSummary(i)`。
- `MenuScreen.cs` 1884 行：主菜单 + 相位机 `Phase { Menu, Pick, City, Info, Slots }` + 白模城市 `BuildCity()` + 过场 `SelectRoutine()`。
- `MenuGfx.cs` 469 行：主菜单平面构成（不用 3D 星球）。线稿天体 `Glyph()`、卫星 `Cluster()`、交错椭圆轨道、流星、三套宇宙。
- `UiStyle.cs` 160 行：全局 UI 语汇。`Fill / Rule / Frame / Label / NumberedRow / Button / Tag / Stroke / IconGear / IconBag`。
- `CardTable.cs` 361 行：卡牌桌面。三立绘位、工序轨 01..05 小卡、接单区、手牌、`DrawCard(r, title, body, lifted, enabled, back, kind, tag)`。
- `Game.cs`：面板式旧 UI，仍有部分流程在用，别整体删。

## 视觉约定（已定，别改）
- 纯黑底、细线（1–1.5px）、米白字、琥珀 `#e07a3a` 只用于"当前/选中"。
- 不用她给的 `card_face / card_back` PSD 图框，卡面就是黑底 + 角标细框。
- 所有图标都手绘线稿（齿轮 24 段圆 + 8 齿，包是方框 + 提手 + 锁扣）。
- 不要自造地名（"葬礼街·第九区""SECTION IV·SITE 09"这类已全部删除，她明确说过没取过这种名字）。

## 交互约定
- 主菜单点星球只高亮，不开局；必须走「新游戏 → 选星球」。
- 空白处拖动 = 整幅星图旋转；在星球上拖 = 只转那颗；点一次放大，再点同一颗才进入白模。
- 时辰走完自动 `EndDay`（打烊按钮已删）。
- 读取存档给横向三条档位条，不是竖手牌。

## 待办（按优先级）
1. 把道具、物资、任务、人物、BUFF、DEBUFF 统一做成卡：都用 `DrawCard` 的 `kind` 与 `tag` 两个字段区分，卡面同一套；背包、任务栏、人物栏都排成手牌形式。
2. 卡牌拖放：手牌能拖到角色位 / 接单区 / 丢弃区，落下判定在 `CardTable` 内完成。
3. 结算面板、七日账、赌场、大学四处仍是旧实心框，换成 `UiStyle`。
4. 工序栏已改成卡，但仍按顺序点；确认点卡是否直接推进该道工序。

## 工程纪律
- 用 Python 改 C# 时别在 heredoc 里写 `"\n"`（会被吞成真换行报 CS1010），用 `string nl = ((char)10).ToString();`。
- 改一行就编译一次，别攒。
- 她说话直、要求具体，别解释设计理念，直接给结果和截图。
