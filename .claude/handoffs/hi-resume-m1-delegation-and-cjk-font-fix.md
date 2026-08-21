# 交接：hi-resume M1 委托流水线与中文字体嵌入修复

**写于** 2026-08-22
**仓库** `/Users/yuki/Documents/Repos/hi-resume`（GitHub `yuki-uix/hi-resume`，私有）
**你的角色** planning / 拆任务 / 写验收标准 / review。**不要自己写实现代码** —— 实现全部委托给 DeepSeek，见下文「委托流水线」。

---

## 一、这个项目是什么

hi-resume 是一个本地优先的个人简历管理工具。用户维护一个**条目池**和一份**主简历**，针对不同 JD 创建**岗位版本**，每个岗位版本同时是一条**投递记录**。

用户（yuki）是第一个也是唯一的用户。他现在用 FlowCV，免费版只能维护一份简历，针对新 JD 的调整会破坏性覆盖上一次的成果。

核心设计决策全在 `docs/MVP-PRD.md` 与 `docs/ARCHITECTURE.md`，都已合入 main。**动手前先读这两份**，尤其：

- PRD §5 核心产品模型（三层：条目池 / 主简历 / 岗位版本）
- PRD §8 数据模型草案
- ARCHITECTURE §3 数据层原则（含「继承粒度」那张表）
- ARCHITECTURE §4「分页：测量式，屏幕与打印共用同一套页容器」
- ARCHITECTURE §4「测量式分页的三条硬约束」← 每一条都是被真实打脸打出来的

### 关键模型（别搞错）

内容只存一份在条目池里。「一份简历长什么样」由 `ResumeComposition` 描述：选了哪些区块 / 条目 / bullet，以及顺序。主简历和岗位版本用**同一种**组合结构，岗位版本只存与主简历不同的 key。

```ts
resolveComposition(master, variantPartial) // 逐 key 回退
buildRenderModel(pool, composition, textOverrides) // 输出模板直接消费的扁平结构
```

回退粒度（`docs/ARCHITECTURE.md` §3 有表，实现在 `src/domain/composition/resolve.ts`）：

| 字段 | 粒度 |
|---|---|
| `sectionOrder` / `visibleSections` | 整体替换 |
| `sectionTitles` | 每个 `SectionId` |
| `entrySelection` | 每个 `SectionId` |
| `bulletSelection` | 每个 `EntryId` |

**没有 `orphaned` 状态**。主简历「删除」条目只是移出选择清单，条目留在池里，选用它的版本不受影响。

**没有 `composition.summary`**。个人简介是 `kind: 'summary'` + `layout: 'text'` 的普通区块，正文存 `Section.text`，版本覆盖走 `textOverrides[sectionId]`。

---

## 二、当前进度

M1 = 「一份主简历跑通闭环」。七个任务已全部合入 main：

| Issue | PR | 内容 |
|---|---|---|
| #2 | #11 | 领域类型、稳定 ID、`resolveComposition`、`buildRenderModel`、Zod schema |
| #3 | #12 | 唯一模板 + 测量式真实分页预览 |
| #4 | #14 | 区块管理编辑器（左栏 + 预览悬停工具条） |
| #5 | #16 | 条目与 bullet 编辑器 + 测量隔离闸 |
| #6 | #17 | IndexedDB 持久化、自动保存、空工作区启动 |
| #7 | #19 | JSON 导入导出 |
| #8 | #21 | PDF 导出与打印样式 |

**但 M1 还没完成。** 还有一个阻塞项 issue #20（下节详述）。

### 后续里程碑（尚未开工）

- **M2** 素材池与岗位版本（继承、调整、`upstream-changed` 提示）
- **M3** 投递追踪（状态、事件、下一步动作、首页看板）
- **M4** Markdown 导入（一次性单向脚本，刻意排到最后）

用户的素材库是 **markdown 格式**，但至今没给过路径。M4 开工前要问他要。

---

## 三、当前正在进行的工作：issue #20

### 问题

导出 PDF 的中文 ToUnicode 映射指向**康熙部首**而不是 CJK 统一表意文字：

| 简历里 | PDF 里 | 应该是 |
|---|---|---|
| 人 | `U+2F08` KANGXI RADICAL MAN | `U+4EBA` |
| 工 | `U+2F2F` KANGXI RADICAL WORK | `U+5DE5` |
| 目 | `U+2F6C` KANGXI RADICAL EYE | `U+76EE` |

字形完全一样，肉眼和截图都看不出。`pdftotext`（poppler）会归一化所以读出来是对的，`pypdf` 照实读就是错的。ATS 用 pypdf 一类解析器时，「工作经验」被读成另一个字符串，关键词匹配失效 —— 而 ATS 友好是这产品的前提。

### 根因（比「系统字体」更深一层）

Chromium 的 print-to-PDF：

- **静态 TrueType(glyf) 轮廓** → 嵌成 CIDFontType2，ToUnicode 正确 ✅
- **CFF 轮廓** → 画成 Type 3，ToUnicode 落在康熙部首 ❌
- **可变字体(gvar)** → 也画成 Type 3 ❌

上游的完整 CJK 字体只提供 CFF 静态版或 TrueType 可变版，**两个都不能直接用**，必须把可变字体在需要的字重上实例化成静态 glyf。

这条是 DeepSeek 实测挖出来的，写在 `scripts/instantiate-font.mjs` 的注释里。

### 方案（已确认，用户拍板过）

- 字体：Source Han Sans SC 可变字体（TrueType 构建），实例化成 400 / 700 两个静态字重
- 覆盖范围：`[0x4e00, 0x9fff]` **完整基本区** + 简历用到的拉丁/标点区间
- **包体不做取舍。** 用户明确拍板「完整覆盖优先于体积」，理由是本地优先 + 最终打包 Tauri 桌面应用，几十 MB 可接受；而任何覆盖缺口都会以「只在真实使用时出现、只影响个别字、肉眼看不出」的方式伤人。
- 源文件 `src/features/preview/SourceHanSansSC-VF.ttf.woff2` 已在工作区，13.5 MB

**曾经验证过 `@fontsource/noto-sans-sc` 不够**：U+4E00–U+9FFF 共 20992 个码位，它**缺 8750 个**（42%）。完整 Noto Sans CJK SC 只缺 16 个（U+9FF0–U+9FFF，Unicode 11 后新增，多数字体都没有）。

### 现场状态

- worktree：`/Users/yuki/Documents/Repos/hi-resume/.claude/worktrees/m1-8-font`
- 分支：`fix/embed-cjk-font`，基底 `f42d49f`
- **commit 数：0**（跑了两轮共 ~250 次工具调用都没提交，全靠工作区保着）
- 已有约 131 行未提交改动，落点都正确：

```
 M e2e/measurement-gate.spec.ts        反空过断言改新字体名（改而非删）
 M e2e/pdf-export.spec.ts              +85 行，两解析器码位校验
 M package.json                        + subset-font（实例化工具）
 M src/features/preview/PaginatedPreview.tsx   font-load 门
 M src/features/preview/fixtures.ts    生僻字夹具（没动 src/domain/，正确）
 M src/main.tsx                        import fonts.css
 M src/templates/standard/template.css 排版根换字体（第 16 行）
?? scripts/instantiate-font.mjs        可变字体 → 静态 glyf 实例化脚本
?? src/features/preview/SourceHanSansSC-VF.ttf.woff2   13.5MB 源字体
?? src/features/preview/fonts.css      @font-face
?? src/features/preview/fonts.ts       font-load 门的实现
?? e2e/_dump.spec.ts                   临时文件，要清
```

根目录可能还有 `scan-cjk.cjs` / `scan-font-coverage.cjs`，临时文件，要清。

### 还剩什么

1. 跑通 `scripts/instantiate-font.mjs`，产出 400/700 静态字体并接进 `@font-face`
2. **重新基线化 `e2e/pagination.spec.ts`** —— 字体度量变了，页数与每页首末 `data-entry-id` 会变。**算出新的正确值，不是放宽断言**
3. 跑通验收（见下）
4. 清临时文件

### #20 的验收标准（必须全部满足）

```bash
# 1. 不再有 Type 3，emb 全 yes
pdffonts /tmp/out.pdf

# 2. 两个独立解析器结果完全一致，码位全在 U+4E00–U+9FFF，不出现 U+2Fxx
pdftotext /tmp/out.pdf -
python3 -c "from pypdf import PdfReader; print(''.join(p.extract_text() for p in PdfReader('/tmp/out.pdf').pages))"

# 3. 生僻字（頔玥甯）同样通过
# 4. 屏幕 .resume-page 数 == page.pdf() 页数
# 5. 应用离线可用，字体不走网络
```

**注意 `e2e/measurement-gate.spec.ts` 里有两行反空过断言**（`font-family` 含 `system-ui`、`font-size` 为 `12.5px`），换字体后必挂 —— **改成新字体名，不许删掉或放宽**。没有它们，两边同时退回默认字体时闸会「相等即通过」，变成假闸。

---

## 四、委托流水线（最重要的一节）

### 分工

用户明确要求：**Claude 做 planning / review / 决策，实现类工作全部交给 DeepSeek**，通过 headless CLI 执行。理由来自他 RepoCoach 项目的复盘：定计划和验收的一方不应同时是实现方，否则验收变成自查。

记忆文件：`/Users/yuki/.claude/projects/-Users-yuki-Documents-Repos-hi-resume/memory/division-of-labor-deepseek.md`

### 怎么派任务

```bash
cd /Users/yuki/Documents/Repos/hi-resume

# 1. 建独立 worktree（每任务一个，不并发）
git worktree add -b feat/xxx .claude/worktrees/m1-N-name main

# 2. 写 prompt 到 scratchpad（不进版本库）

# 3. 派
bash scripts/delegate.sh <issue-number> <worktree-path> <prompt-file> \
  > .delegate-logs/run-issue-N.console 2>&1
```

`scripts/delegate.sh` 已在 main 上。它做这些事：

- 从 `/Users/yuki/Documents/Repos/hi-resume/.env.local` 读 `DEEPSEEK_API_KEY`（**不打印、不写日志**）
- 端点 `https://api.deepseek.com/anthropic`，模型默认 `deepseek-v4-pro`
- **剥离全部 `CLAUDE_*` 环境变量** —— 不剥的话子 CLI 会以为宿主通过 `CLAUDE_CODE_MESSAGING_SOCKET` 供认证，无限挂起（零输出、不报错、不退出）
- 注入 `ROLE_NOTE` 身份声明 —— 子 CLI 会继承本仓库项目记忆，读到「实现交给 DeepSeek」后会以为自己也该往下委托，只写规格不写代码（issue #20 第一次运行就这样停在第 27 轮）
- 工具白名单**不含 `git push` 和 `gh pr create`**
- 跑完**核对 payload**：`is_error`、`api_error_status`、工具调用数

可覆盖：`DEEPSEEK_MODEL`、`DELEGATE_MAX_TURNS`（默认 200，UI/字体这类任务要提到 400）

### 退出码会骗人

真实发生过：`"subtype": "success"` 但 `is_error: true`、`terminal_reason: "api_error"`、**0 个工具调用**。只看 subtype 会以为成功了。脚本的 payload 核对就是防这个。

### 余额

```bash
KEY=$(grep -m1 -E "^[[:space:]]*(export[[:space:]]+)?DEEPSEEK_API_KEY[[:space:]]*=" \
  /Users/yuki/Documents/Repos/hi-resume/.env.local | sed -E "s/^[^=]*=[[:space:]]*//; s/^[\"']//; s/[\"']$//")
curl -s https://api.deepseek.com/user/balance -H "Authorization: Bearer $KEY"
```

**派任务前一定要查。** 中途因余额中断过两次。

实测成本（deepseek-v4-pro，官方费率 cache-miss input $0.66/M、cache-hit $0.022/M、output $1.98/M，高峰翻倍）：

| 任务类型 | 低谷 | 高峰 |
|---|---:|---:|
| 纯逻辑（#3 量级） | ¥3.3 | ¥6.5 |
| UI（#4/#5 量级） | ¥4.3 | ¥8.5 |

**高峰时段是北京时间 09:00–12:00 和 14:00–18:00**（UTC 01:00–04:00 与 06:00–10:00）。低谷派任务省一半。

**缓存读占 token 总量的 96%**，所以拿「总 token」当成本指标会高估到离谱 —— 真正付钱的是新增 input 和 output，output 反而是低谷成本的大头（约 47%）。

**一次跑完永远比分两次续跑便宜**，因为续跑要重读全部上下文。

### 监控

用 `Monitor` 工具挂一个轮询，每分钟查日志增长，每 6 分钟报一次工具调用数 + commit 数 + 余额。必须覆盖失败面 —— 只 grep 成功标记的监控，在进程挂死时和正常运行长得一模一样。

有用的额外检查：
- 盯到的日志文件里如果已有 `result` 事件，说明认错了旧日志，直接报警退出
- 启动 2 分钟无工具调用 → 可能 API 不通
- 5 分钟无文件改动 → 可能在写规格而不是写代码

### 验收流程

1. **payload 核对**（脚本自动）
2. **自己跑一遍测试**，不看它的自述
3. **核对外部事实**，不只看测试状态
4. 逐条对 AC
5. 结论「可合并」后：

```bash
# .verify-ok 必须放在会话 cwd 的 git 根，不是任务 worktree
# 而且必须和 gh pr create 分成两次 Bash 调用 —— hook 在命令执行前检查
touch "$(git rev-parse --show-toplevel)/.verify-ok"
```

然后 push + `gh pr create`（body 必须含 `Closes #X`）。

hook 在 `~/.claude/hooks/pre-push-verify.sh`，`.verify-ok` 是一次性标记，push 后自动删除，已在全局 gitignore 里。

---

## 五、反复被打脸的验收陷阱（每一条都真实发生过）

按发生顺序：

**1. 测试手工复刻被测逻辑。** 在测试里再 merge 一遍然后断言相等 —— 这种测试永远绿。AC 要写「期望值必须是手写字面量」。

**2. 探针不走真实入口。** 分页正确性没法用单元测试保证；性能测量必须用 Playwright 真实打字 + MutationObserver，不许直接调内部函数计时。

**3. 契约自己没走一遍。** issue #2 的 `RenderModel` 里没有个人简介的落脚点 —— 我写契约时没拿夹具比划一遍。DeepSeek 照契约实现并停下来问，才发现。

**4. 新增闸没做双向检查。** `RenderSection.text` 加进 #2 之后，#3 的模板还只渲染 `entries`，个人简介会在模板层再消失一次。**新增字段要回头看所有既有路径。**

**5. 静默测量污染。** 编辑器外层一句 `font-family: system-ui` 级联进离屏测量容器，页边界整体偏移，四条分页断言同时挂。故障源不在分页代码也不在模板，而在一个与分页无关的组件的样式上。

修法是结构性隔离（测量容器与页容器共享 `.resume-typography`）+ 一道 computed-style 闸。**我验证过那道闸真的会响**：只给 `.pagination-measurer` 加 `letter-spacing: 1px`，闸红了并指名道姓；而同一份污染下 `pagination.spec.ts` **13/13 照样全绿** —— 偏移太小分页测不出，闸抓到了。

**6. 测试写对了但被测的东西还不存在。** #7 的往返等价测试 `toStrictEqual` 比整份 JSON、不豁免字段，看起来无懈可击 —— 但导出的 JSON 里**一个时间戳字段都没有**（M1 的 `variants` 恒为空）。已开 issue #18 记下，M2 引入岗位版本时补。

**7. 单一工具验证不够。** #8 的 `pdffonts emb=yes` 通过、`pdftotext` 提取正确、截图正常 —— 三道检查全过，底下的 Unicode 映射仍然是错的。换 `pypdf` 才暴露。

→ **凡是「导出物给外部系统消费」的验收，至少用两个独立实现去读。**

**8.（本次）根据工具调用名推断意图，而不是读它写下的东西。** 见下节。

---

## 六、用户最后问的问题：那次误判该怎么改进

事情经过：issue #20 跑到第 50 分钟时，我在监控里看到最近几个动作是 `npm search "harfbuzz subset"` / `npm view subset-font` / `pnpm add -D subset-font`，判断它在**为了压体积做窄子集**，会把刚解决的覆盖问题装回来 —— 于是把进程杀了，还向用户宣布它跑偏了。

读了它写的 `scripts/instantiate-font.mjs` 注释之后才发现判断反了：

> 保留的字形集是完整的统一表意文字基本区加简历实际用到的拉丁和标点区间，所以打包的字体是**全覆盖，不是「常用 3500」子集**。

`subset-font` 在那里是**把可变字体实例化成静态 glyf 字重**的工具 —— 而这是修好 #20 的**唯一**可行路径，因为可变字体本身也会被嵌成 Type 3。我杀掉的是唯一正确的解法。

### 根子在哪

**我手上有它写的代码可以读，却用日志里的动作名去猜意图。** 这和「只看测试状态不核对外部事实」是同一个毛病，只是这次我站在犯错的一边 —— 我一直要求 DeepSeek 核对外部事实，自己却在做纸面推断。

而且中断是**不可逆**的（50 分钟工作、¥4 成本、上下文全丢），我在做不可逆决定前没有付出与之匹配的核实成本。读一个文件要 10 秒。

### 具体改进（建议下一个 agent 照做）

1. **中断运行中的委托之前，先读它写的文件。** 不可逆动作的核实成本必须与后果匹配。至少读 `git status` 里新增/修改文件的头部注释 —— DeepSeek 一直在注释里写清楚「为什么这么做」，那是现成的意图声明。

2. **监控报告要包含意图证据，不只是动作名。** 现在的 Monitor 报「最近 Bash」，信息量太低。改成同时报最近改动的文件名，甚至新增文件的首行注释。动作名会误导，代码不会。

3. **区分「跑偏」和「在解决我不知道的子问题」。** 我预设了解法（换字体就完事），它发现真实约束比我以为的复杂（CFF 和可变字体都会变 Type 3）。**规格制定者不知道的东西，实现者可能已经知道了。** 看到它做规格外的事，第一反应应该是「它发现了什么我没想到的」，而不是「它跑偏了」。

4. **不确定时先问，别先杀。** 委托进程没法接消息，但我可以先看、先记，等它自己停下来再判断。50 分钟无 commit 确实值得警惕，但那是「要求它提交检查点」的理由，不是「立刻杀掉」的理由。

5. **把「零 commit」和「方向可疑」分开处理。** 前者是流程问题（prompt 里要求分块提交，脚本层面可以考虑定时提醒），后者才需要判断。我把两件事混在一起，用前者的焦虑驱动了后者的误判。

6. 已经做了的：`scripts/delegate.sh` 里注入了 `ROLE_NOTE`，解决身份混淆；`DELEGATE_MAX_TURNS` 对重任务提到 400。

---

## 七、当前仓库状态（接手第一件事）

```
main                       f42d49f  Merge PR #21
chore/delegate-role-clarity cfc22f2  ← 未推送，需要开 PR
fix/embed-cjk-font         f42d49f + 131 行未提交改动  ← issue #20 进行中
```

**注意：主仓库 checkout 当前停在 `chore/delegate-role-clarity`，不是 main。**

worktrees：
```
/Users/yuki/Documents/Repos/hi-resume                              [chore/delegate-role-clarity]
.../.claude/worktrees/m1-8-font                                    [fix/embed-cjk-font]
.../.claude/worktrees/task-requirements-discussion-ba385e          [planning]  ← 会话工作目录
```

**待办：**

1. `chore/delegate-role-clarity` 需要 push + 开 PR（无关联 issue，不触发 `/verify`）。commit `cfc22f2` 已在，内容是 delegate.sh 的 ROLE_NOTE 注入
2. issue #20 的续跑正在后台运行（`bp1409qz9`，prompt 在 `scratchpad/prompt-issue-20-resume.md`）—— 检查它是否还活着：`pgrep -f "prompt-issue-20-resume"`
3. issue #20 完成后 M1 才算收官
4. issue #18 留给 M2

**开放的 issue：#18、#20。没有开放的 PR。**

---

## 八、项目纪律速查（来自用户全局 CLAUDE.md）

- 永远 feature branch + PR，不直接 commit main
- 分支命名：`feat/` `fix/` `chore/` `docs/`
- commit message **必须全英文**，格式 `type: 简短描述`
- PR body 含 `Closes #X`（有 issue 时）
- 关联 issue 的 PR，push 前必须过 `/verify`
- 委托的工具白名单不给 `git push`
- 每任务独立 worktree，不并发跑多个 headless 进程
- 要花钱的运行，先报预估金额，等确认再跑
- 覆盖面写成测试，不写成 checklist
- prompt 表达意图，出口闸保证性质

---

## 九、给下一个 agent 的一句话

这个项目做得还不错的地方，不是代码写得多好，而是**每次「测试全绿」之后又挖出一层底下的错**：测试复刻逻辑 → 探针不走真实入口 → 契约有洞 → 闸只装一半 → 静默样式污染 → 测试对了但被测对象不存在 → 单一工具读不出错误映射。

保持这个劲头。但也记住第 8 条：**这个怀疑要一视同仁地用在自己身上**。我要求 DeepSeek 核对外部事实，自己却靠日志里的动作名猜意图，然后杀掉了一个做对了的运行。
