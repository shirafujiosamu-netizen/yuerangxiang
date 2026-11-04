# oc-game 赌场占位图 · 真相记录

> 交接文档转存。2026-10-22 生成，2026-10-30 记录。

## 结论速查

`F:\job\oc-game` 赌场三张占位图，**2026-10-22 17:12–17:14** 由 ImageGen 生成，`quality: medium`，落盘后 `mv` 改名。都是占位图，不是终稿。

| 文件 | 尺寸 | 方式 | ImageGen 原名 |
|---|---|---|---|
| `art/eidos/eidos_casino_placeholder.png` | 1024×1024 | 图生图 | `The_same_character_from_the_re_2026-10-22T08-13-37.png` |
| `art/otakmarkad/otak_placeholder.png` | 1024×1536 | 文生图 | `Dark_fantasy_character_concept_2026-10-22T08-13-01.png` |
| `art/scenes/vault_bg_placeholder.png` | 1536×1024 | 文生图 | `Dark_atmospheric_background_ar_2026-10-22T08-14-34.png` |

## 原始参数（原文照抄）

### Eidos 赌场庄家（图生图，`input_fidelity: high`）

`image1`: `C:/Users/33633/.workbuddy/clipboard-images/clipboard-2026-10-22T08-04-59-896Z-b6e399fe.jpg`（作者当天 17:04 上传的 Eidos 三视图剪贴板原件）

```
The same character from the reference image, now sitting behind a casino dealer table as the house host, red and yellow harlequin-style costume with black tentacles, calm unsettling smile, dim red-yellow casino lighting, dark horror atmosphere, upper body scene composition, concept art
```

prompt 首句 `The same character from the reference image` 是整段核心：语义是「把参考图里这个人放到赌桌后面当庄家」，不是从零描述角色。

### Ótakmarkað 技能树看板（文生图 1024×1536）

```
Dark fantasy character concept art, full body, androgynous figure age 16-18, jet-black choppy bob haircut, golden goat-slit pupils, small mole under left eye, no ears, four black octopus tentacles emerging from back with faint floating gold diamond patterns, four dark red horns, lazy arrogant expression, pale skin, dark black-blue background, atmospheric lighting, placeholder portrait art
```

### 氛围底图（文生图 1536×1024）

```
Dark atmospheric background art, endless void storage interior like a boundless junk box, faint floating gold particles and dust, deep blue-black darkness with subtle depth layers, distant silhouettes of objects, eerie quiet horror mood, minimalist, game scene background
```

## 接线位置

图片引用在 `src/js/ui.js`（**不在** `index.html` 或 `style.css`）：

- 第 9 行 `var ART_OTAK = '../art/otakmarkad/otak_placeholder.png';`
- 第 10 行 `var ART_EIDOS = '../art/eidos/eidos_casino_placeholder.png';`
- 第 336 行 Ótakmarkað 插进 `.otak-panel`
- 第 360 行 Eidos 插进 `renderCasino()` 的 `.eidos-panel`，含 `dealer-name` / `dealer-arch` / `dealer-line`（「赔率永远公平。」）

Eidos 档案 id `dk_eidos`，archetype「完人之门 · 邪神」。换正式立绘只要覆盖同名文件，代码不用动。

## 排查方法（可复用）

- WorkBuddy 会话 jsonl：`C:\Users\33633\.workbuddy\projects\f-job\<session-id>.jsonl`。工具调用是**顶层 `type == "function_call"`**，参数在 `arguments`（JSON 字符串，需二次 parse）；返回是顶层 `function_call_result`，内容在 `output`。`content[]` 里的 block 只有 `input_text`/`output_text`/`image_blob_ref`/`input_image`，**没有 tool_use**。时间过滤用顶层 `timestamp`（毫秒）。计费事件是 `type == "credit-usage"`，只有 `id/parentId/timestamp/type`，不含金额。
- AI 生成的 PNG 在 `eXIf` 块里嵌 JSON，可反查批次：`ProduceID: codebuddy-p-…`、`ContentProducer`、`Bindings`（phash 软哈希 + sm3 + sm2）。ProduceID 前缀与同期 `credit-usage` 的 `id` 前缀一致。
- ImageGen 的 `image_gen_tool_result` 只有 `type/prompt/status/images` 四个字段，没有 credit/cost/quota。界面显示 0 是因为没数据可显示，不等于没花钱。

## 上一轮犯过的错（别再犯）

1. **搜漏文件**：查图片引用只 grep 了 `src/index.html` 和 `src/css/style.css`，漏了 `src/js/ui.js`（赌场 DOM 由它拼），得出「图根本没接进去」的错误结论。`docs/dev_notes.md`、`docs/test_report.md` 里早有「Eidos 占位图加载成功（红黄黑戏服可见）」。
2. **搜错 jsonl 位置**：按 `content[].type == "tool_use"` 找工具调用，白扔 8732 条记录，误判「prompt 没存档」。
3. **查不到就编**：凭视觉印象反推三张 prompt 交差，与真实参数大面积不符（Ótakmarkað 被编成「星云构成的 faceless 实体」，真实是金瞳羊膜、无耳、四触手、四红角；氛围底被编成「地下金库与棺材」，真实是无限虚空仓储 / 无界垃圾盒）。**查不到就说查不到，不要用推理补。**
