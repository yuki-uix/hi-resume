# 架构与技术决策

状态：Proposed
更新日期：2026-08-21

## 1. 总体方向

采用“Web-first 开发，Desktop-first 交付”的策略：

- 开发阶段使用 React + TypeScript + Vite，快速验证编辑器和预览；
- 数据层从第一天开始与 UI 解耦；
- MVP 稳定后，再使用 Tauri 打包为本地桌面应用；
- 核心功能不依赖服务器。

## 2. 推荐技术栈

| 层 | 选择 | 原因 |
|---|---|---|
| UI | React + TypeScript | 适合复杂表单、局部更新和类型约束 |
| 构建 | Vite | 本地开发快，便于后续桌面打包 |
| 状态 | Zustand | 适合小型本地应用，减少样板代码 |
| 持久化 | IndexedDB + Dexie | 支持结构化数据和自动保存 |
| 渲染 | HTML/CSS | 文本可选中，适合 ATS 和打印 |
| PDF | 浏览器/Chromium 打印 | 与预览使用同一套 DOM/CSS |
| 校验 | Zod | 导入 JSON 时提供清晰错误信息 |
| 测试 | Vitest + Playwright | 覆盖数据逻辑和关键用户流程 |

## 3. 数据层原则

### 主数据和版本覆盖分离

主简历保存完整内容；岗位版本只保存覆盖值、隐藏状态和排序状态。

```text
render( master, variant )
  = applyOverrides(master, variant.overrides)
  + applyVisibility(variant.hiddenPaths)
  + applyOrdering(variant.orderOverrides)
```

### 稳定 ID

每个区块和条目都必须有稳定 ID。不能使用数组下标作为覆盖路径，否则排序或删除内容后会产生错误覆盖。

### JSON 备份优先

JSON 是工作区的可迁移备份格式。IndexedDB 只是默认存储，不应成为用户唯一的数据出口。

## 4. 渲染与导出原则

- 编辑表单和简历预览共享同一份渲染模型；
- 预览内容使用真实文本和结构化 HTML；
- 打印样式独立定义 `@page`、页边距和分页规则；
- 默认使用单栏布局；
- 不使用 canvas 截图作为 PDF 的主要内容；
- 模板与数据解耦，后续可以增加模板而不重写编辑器。

## 5. 版本冲突处理

如果主简历删除了某个被岗位版本覆盖的条目：

1. 不直接丢弃岗位版本数据；
2. 将覆盖值标记为 `orphaned`；
3. 在岗位版本中显示待处理提示；
4. 用户可以恢复、删除或转为岗位版本独立内容。

## 6. 本地优先约束

MVP 不应引入：

- 用户账号；
- 必需的 API 服务；
- 远程数据库；
- 默认开启的分析服务；
- 依赖网络才能完成的导出流程。

如果未来加入 AI，必须作为显式的可选能力，并清楚显示哪些内容会离开本机。

## 7. 初始目录建议

```text
src/
  app/
  components/
  domain/
    resume/
    variants/
  features/
    editor/
    workspace/
    export/
  persistence/
  templates/
  styles/
tests/
docs/
```
