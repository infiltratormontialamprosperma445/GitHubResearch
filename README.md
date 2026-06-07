<div align="center">
  <img src="build/icon.png" alt="Star Intel Desk" width="120" height="120">
  <h1>Star Intel Desk</h1>
  <h3>Local-First GitHub Intelligence Workspace</h3>
  <h3>本地优先的 GitHub 情报工作台</h3>
  <p>Track trending repositories with AI-powered classification across 6 data sources<br>
  跨 6 大数据源追踪热门仓库，AI 驱动智能分类</p>

  <p>
    <a href="https://github.com/zrz2004/GithubSearch/releases/latest">
      <img src="https://img.shields.io/github/v/release/zrz2004/GithubSearch?style=flat-square&color=d97757" alt="Release">
    </a>
    <a href="https://github.com/zrz2004/GithubSearch/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/zrz2004/GithubSearch?style=flat-square" alt="License">
    </a>
    <a href="https://github.com/zrz2004/GithubSearch/stargazers">
      <img src="https://img.shields.io/github/stars/zrz2004/GithubSearch?style=flat-square" alt="Stars">
    </a>
    <a href="https://github.com/zrz2004/GithubSearch/issues">
      <img src="https://img.shields.io/github/issues/zrz2004/GithubSearch?style=flat-square" alt="Issues">
    </a>
    <img src="https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron" alt="Electron">
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#features">Features</a> •
    <a href="#data-sources">Data Sources</a> •
    <a href="#ai-classification">AI Classification</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#roadmap">Roadmap</a>
  </p>
  <p>
    <a href="#快速开始">快速开始</a> •
    <a href="#功能特性">功能特性</a> •
    <a href="#数据源">数据源</a> •
    <a href="#ai-分类">AI 分类</a> •
    <a href="#架构">架构</a> •
    <a href="#路线图">路线图</a>
  </p>
</div>

---

## Quick Start

### Prerequisites

- **Node.js** >= 18 (recommended 20+)
- **npm** >= 9

### Install & Run

```bash
git clone https://github.com/zrz2004/GithubSearch.git
cd GithubSearch
npm install
npm run dev
```

### Build Installer

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

## Download

### Latest Release: v1.0.0

| Platform | Architecture | Download |
|----------|:---:|:---:|
| **Windows** | x64 | [NSIS Installer](https://github.com/zrz2004/GithubSearch/releases/latest) • [Portable](https://github.com/zrz2004/GithubSearch/releases/latest) |
| **macOS** | Intel / Apple Silicon | [DMG](https://github.com/zrz2004/GithubSearch/releases/latest) |
| **Linux** | x64 | [AppImage](https://github.com/zrz2004/GithubSearch/releases/latest) • [deb](https://github.com/zrz2004/GithubSearch/releases/latest) |

[View All Releases](https://github.com/zrz2004/GithubSearch/releases)

---

## 快速开始

### 环境要求

- **Node.js** >= 18（推荐 20+）
- **npm** >= 9

### 安装与运行

```bash
git clone https://github.com/zrz2004/GithubSearch.git
cd GithubSearch
npm install
npm run dev
```

### 构建安装包

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

## 下载

### 最新版本: v1.0.0

| 平台 | 架构 | 下载 |
|------|:---:|:---:|
| **Windows** | x64 | [NSIS 安装包](https://github.com/zrz2004/GithubSearch/releases/latest) • [便携版](https://github.com/zrz2004/GithubSearch/releases/latest) |
| **macOS** | Intel / Apple Silicon | [DMG](https://github.com/zrz2004/GithubSearch/releases/latest) |
| **Linux** | x64 | [AppImage](https://github.com/zrz2004/GithubSearch/releases/latest) • [deb](https://github.com/zrz2004/GithubSearch/releases/latest) |

[查看所有版本](https://github.com/zrz2004/GithubSearch/releases)

---

## Features

- **Six Data Sources** — GitHub Trending, GitHub Search API, Telegram AI Channels, X (Twitter) AI Signals, GH Archive WatchEvents, Supplemental Catalog
- **FTS5 Full-Text Search** — Native SQLite FTS5 engine with bm25 ranking and snippet highlighting, Command Palette (`Cmd/Ctrl+K`) for instant access
- **AI Summary** — SSE-streamed AI-powered repository summaries with rule-based fallback for offline use
- **Worker Process Isolation** — Heavy database and crawling operations run in a dedicated `utilityProcess` Worker, keeping the UI responsive
- **AI Classification** — 11 AI subcategories with hundreds of keyword vectors, plus Developer Tools, Frontend, Backend, Data, Security, Infrastructure
- **Multi-Factor Ranking** — Growth score, source diversity, activity, quality, and risk penalty
- **Local-First** — Native SQLite via better-sqlite3, WAL mode, FTS5 virtual tables, zero cloud dependency, full data privacy
- **Dark IDE Theme** — Claude Code / Codex inspired dark-first design with custom titlebar, warm orange accent (`#d97757`), monospace data tables
- **Real-Time Updates** — Automated daily refresh with customizable schedule, real progress bar with cancel support
- **Cross-Platform** — Windows, macOS, Linux with native installers
- **Bilingual** — English and Chinese interface
- **Desktop-Native** — Custom frameless titlebar, keyboard shortcuts, dark/light theme toggle

### Feature Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Hot repos, category leaders, anomaly detection, source health overview |
| **Trending Explorer** | Browse trending repos by time window with search and category filters |
| **Command Palette** | `Cmd/Ctrl+K` — Full-text search, multi-dimensional filters, 5 sort modes |
| **AI Summary** | Stream-generated repository summaries with caching, rule-based fallback |
| **Category Intelligence** | Distribution across 11+ AI subcategories with top project rankings |
| **Compare** | Side-by-side comparison of up to 5 repositories with sparkline trends |
| **Learning Hub** | Export Markdown learning notes from saved repos |
| **Alerts** | Custom keyword, category, and repository alert rules |
| **Data Sources** | Health status, weight, and coverage metrics for all 6 sources |
| **Classifier Lab** | View and correct AI classification results with manual override |
| **Settings** | Token, proxy, AI config, refresh schedule, backup management |

---

## 功能特性

- **六大数据源** — GitHub Trending、GitHub Search API、Telegram AI 频道、X (Twitter) AI 信号、GH Archive WatchEvents、补充目录
- **FTS5 全文搜索** — 原生 SQLite FTS5 引擎，支持 bm25 排序与 snippet 高亮，Command Palette (`Cmd/Ctrl+K`) 即时访问
- **AI 摘要** — SSE 流式输出 AI 驱动的仓库摘要，离线时自动使用规则兜底
- **Worker 进程隔离** — 数据库和爬取操作运行在独立的 `utilityProcess` Worker 中，UI 始终保持流畅
- **AI 分类** — 11 个 AI 子分类，数百个关键词向量，覆盖开发工具、前端、后端、数据、安全、基础设施
- **多因子排名** — 增长分数、来源多样性、活跃度、质量和风险惩罚
- **本地优先** — 原生 SQLite (better-sqlite3)，WAL 模式，FTS5 虚拟表，零云依赖，完全数据隐私
- **深色 IDE 主题** — Claude Code / Codex 风格深色优先设计，自定义标题栏，暖橙色主题色 (`#d97757`)，等宽数据表格
- **实时更新** — 自动每日刷新，可自定义计划，真实进度条支持取消
- **跨平台** — Windows、macOS、Linux，原生安装包
- **双语支持** — 中英文界面
- **桌面原生** — 自定义无边框标题栏，键盘快捷键，深色/浅色主题切换

### 功能模块

| 模块 | 描述 |
|------|------|
| **仪表盘** | 热门仓库、分类领先者、异常检测、数据源健康概览 |
| **趋势探索** | 按时间窗口浏览热门仓库，支持搜索和分类筛选 |
| **命令面板** | `Cmd/Ctrl+K` — 全文搜索、多维筛选、5 种排序模式 |
| **AI 摘要** | 流式生成仓库摘要，支持缓存，规则兜底 |
| **分类智能** | 11+ AI 子分类分布，含顶级项目排名 |
| **对比分析** | 最多 5 个仓库的并排对比，含趋势迷你图 |
| **学习中心** | 从收藏仓库导出 Markdown 学习笔记 |
| **告警系统** | 自定义关键词、分类和仓库告警规则 |
| **数据源** | 所有 6 个数据源的健康状态、权重和覆盖指标 |
| **分类实验室** | 查看和修正 AI 分类结果，支持手动覆盖 |
| **设置** | Token、代理、AI 配置、刷新计划、备份管理 |

---

## Data Refresh Guide

### Step 1: Configure GitHub Token (Highly Recommended)

GitHub Token is critical for successful data refresh:
- **Without Token**: GitHub API rate limit is 60 requests/hour — refresh may fail
- **With Token**: Rate limit increases to 5,000 requests/hour — full refresh succeeds

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `star-intel-desk`, check **public_repo** scope
4. Paste into **Settings > GitHub Token**, click **Save**, then **Test GitHub**

### Step 2: Configure Proxy (If Needed)

```
http://127.0.0.1:7890
http://127.0.0.1:1080
socks5://127.0.0.1:1080
```

### Step 3: Configure AI API Key (Optional)

For automatic classification refinement when rule-based classifier has low confidence. Supports any OpenAI-compatible endpoint (OpenAI, Ollama, Azure). **Not required** — the built-in classifier covers all categories.

### Step 4: Trigger Refresh

Click the **Refresh** button or press `Ctrl+R`. The app collects data across daily/weekly/monthly windows with all 6 sources running concurrently. A real progress bar shows the current stage, and you can cancel at any time.

### Refresh Pipeline

```
Discover → Canonicalize → Observe → Snapshot → Classify → AI Review → Score → Alert
```

---

## 数据刷新指南

### 第一步：配置 GitHub Token（强烈推荐）

GitHub Token 对数据刷新至关重要：
- **无 Token**：GitHub API 限制 60 次/小时 — 刷新可能失败
- **有 Token**：限制提升至 5,000 次/小时 — 完整刷新成功

1. 访问 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 命名为 `star-intel-desk`，勾选 **public_repo** 权限
4. 粘贴到 **设置 > GitHub Token**，点击 **保存**，然后 **测试 GitHub**

### 第二步：配置代理（如需要）

```
http://127.0.0.1:7890
http://127.0.0.1:1080
socks5://127.0.0.1:1080
```

### 第三步：配置 AI API Key（可选）

用于规则分类置信度较低时的自动 AI 复核。支持任何 OpenAI 兼容端点（OpenAI、Ollama、Azure）。**非必需** — 内置分类器覆盖所有分类。

### 第四步：触发刷新

点击 **刷新** 按钮或按 `Ctrl+R`。应用将跨日/周/月时间窗口采集数据，6 个数据源并发运行。真实进度条显示当前阶段，可随时取消。

### 刷新流水线

```
发现 → 标准化 → 观测 → 快照 → 分类 → AI 复核 → 评分 → 告警
```

---

## Data Sources

| Source | Description | Weight | Config |
|--------|-------------|:------:|--------|
| GitHub Trending | Trending page scraping (daily/weekly/monthly) | 1.0 | None |
| GitHub Search API | 30+ AI-focused queries, concurrent execution | 0.9 | Token recommended |
| Telegram AI Channels | 10 curated AI channels via `t.me/s/` preview | 0.7 | None |
| X (Twitter) AI Signals | Nitter search + HuggingFace Papers + PapersWithCode | 0.65 | None |
| GH Archive WatchEvents | Real-time star event sampling from gharchive.org | 0.85 | None |
| Supplemental Catalog | Curated cross-domain trend supplement | 0.45 | None |

---

## 数据源

| 数据源 | 描述 | 权重 | 配置 |
|--------|------|:----:|------|
| GitHub Trending | Trending 页面爬取（日/周/月） | 1.0 | 无需 |
| GitHub Search API | 30+ AI 聚焦查询，并发执行 | 0.9 | 推荐 Token |
| Telegram AI 频道 | 10 个精选 AI 频道，通过 `t.me/s/` 预览 | 0.7 | 无需 |
| X (Twitter) AI 信号 | Nitter 搜索 + HuggingFace Papers + PapersWithCode | 0.65 | 无需 |
| GH Archive WatchEvents | gharchive.org 实时 Star 事件采样 | 0.85 | 无需 |
| 补充目录 | 精选跨领域趋势补充 | 0.45 | 无需 |

---

## AI Classification

### Rule-based Classifier

11 AI subcategories with extensive keyword matching:

| Category | Example Keywords |
|----------|-----------------|
| Coding Agents | `code generation`, `aider`, `cursor`, `swe-bench`, `copilot` |
| MCP / Tools | `mcp server`, `function calling`, `tool-use` |
| Agent Frameworks | `langgraph`, `autogen`, `crewai`, `agent pipeline` |
| RAG / Knowledge | `vector store`, `chunking`, `knowledge graph`, `reranker` |
| Model Serving | `tensorrt`, `triton server`, `speculative decoding` |
| Evaluation | `mt bench`, `arena`, `leaderboard` |
| AI Security | `alignment`, `rlhf`, `dpo`, `constitutional ai` |
| Multimodal | `text-to-image`, `stable diffusion`, `flux`, `clip model` |
| LLM Apps | `gpt`, `claude`, `chatgpt`, `deepseek`, `qwen` |
| Training / Fine-tune | `lora`, `qlora`, `peft`, `deepspeed` |
| Data / Infra | `data pipeline`, `feature store`, `mlflow` |

Also covers Developer Tools, Frontend, Backend, Data, Security, Infrastructure categories.

### AI Refinement (Optional)

Low-confidence classifications are sent to an OpenAI-compatible API for secondary confirmation. Skipped when no API key is configured.

---

## AI 分类

### 规则分类器

11 个 AI 子分类，覆盖大量关键词匹配：

| 分类 | 关键词示例 |
|------|-----------|
| 编码代理 | `code generation`, `aider`, `cursor`, `swe-bench`, `copilot` |
| MCP / 工具 | `mcp server`, `function calling`, `tool-use` |
| 代理框架 | `langgraph`, `autogen`, `crewai`, `agent pipeline` |
| RAG / 知识 | `vector store`, `chunking`, `knowledge graph`, `reranker` |
| 模型服务 | `tensorrt`, `triton server`, `speculative decoding` |
| 评测 | `mt bench`, `arena`, `leaderboard` |
| AI 安全 | `alignment`, `rlhf`, `dpo`, `constitutional ai` |
| 多模态 | `text-to-image`, `stable diffusion`, `flux`, `clip model` |
| LLM 应用 | `gpt`, `claude`, `chatgpt`, `deepseek`, `qwen` |
| 训练 / 微调 | `lora`, `qlora`, `peft`, `deepspeed` |
| 数据 / 基础设施 | `data pipeline`, `feature store`, `mlflow` |

同时覆盖开发工具、前端、后端、数据、安全、基础设施等分类。

### AI 复核（可选）

低置信度分类将发送至 OpenAI 兼容 API 进行二次确认。未配置 API Key 时自动跳过。

---

## Architecture

### Project Structure

```
star-intel-desk/
├── electron/                    # Electron main process
│   ├── main.ts                  # App entry, Worker lifecycle, IPC forwarding
│   ├── preload.ts               # Context bridge (AppApiV2)
│   ├── services/
│   │   ├── database.ts          # better-sqlite3 + FTS5 + transactions
│   │   ├── intelligence.ts      # Core service (collect, classify, score)
│   │   ├── summaryService.ts    # AI summary (SSE streaming + rule fallback)
│   │   └── aiClassifier.ts      # AI classification refinement
│   ├── worker/
│   │   └── refreshWorker.ts     # utilityProcess Worker entry point
│   └── sources/
│       ├── types.ts             # SourceAdapter interface
│       ├── github.ts            # GitHub adapters (Trending, Search, Archive)
│       └── social.ts            # Social adapters (Telegram, Twitter/X)
├── src/
│   ├── shared/                  # Shared between main and renderer
│   │   ├── types.ts             # All TypeScript types (AppApiV2, SearchFilters, etc.)
│   │   ├── workerProtocol.ts    # Main ↔ Worker message protocol
│   │   ├── classifier.ts        # Rule-based classifier (11 AI subcategories)
│   │   └── ranking.ts           # Multi-factor ranking algorithm
│   └── renderer/                # React frontend
│       ├── App.tsx              # Main UI with dark IDE theme
│       ├── components/
│       │   ├── CommandPalette.tsx  # Cmd+K search with filters & sort
│       │   └── SkeletonRow.tsx     # Shimmer loading skeleton
│       ├── api.ts               # Frontend API (IPC + v2 methods)
│       ├── i18n.tsx             # EN/ZH internationalization (35+ keys)
│       └── styles.css           # Dark-first design system (Claude/Codex style)
├── build/                       # Build assets (icons)
└── scripts/                     # Build scripts
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Electron 41 |
| **UI** | React 19 + Vite 8 |
| **Language** | TypeScript 6 |
| **Database** | better-sqlite3 (native SQLite + FTS5) |
| **State** | @tanstack/react-query v5 |
| **HTTP** | undici (with proxy support) |
| **Icons** | lucide-react |
| **Markdown** | react-markdown + remark-gfm |
| **Virtualization** | @tanstack/react-virtual |
| **Styling** | CSS Variables + dark-first IDE design system |
| **Packaging** | electron-builder |

---

## 架构

### 项目结构

```
star-intel-desk/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 应用入口、Worker 生命周期、IPC 转发
│   ├── preload.ts               # 上下文桥接 (AppApiV2)
│   ├── services/
│   │   ├── database.ts          # better-sqlite3 + FTS5 + 事务
│   │   ├── intelligence.ts      # 核心服务（采集、分类、评分）
│   │   ├── summaryService.ts    # AI 摘要（SSE 流式 + 规则兜底）
│   │   └── aiClassifier.ts      # AI 分类复核
│   ├── worker/
│   │   └── refreshWorker.ts     # utilityProcess Worker 入口
│   └── sources/
│       ├── types.ts             # SourceAdapter 接口
│       ├── github.ts            # GitHub 适配器（Trending、Search、Archive）
│       └── social.ts            # 社交适配器（Telegram、Twitter/X）
├── src/
│   ├── shared/                  # 主进程与渲染进程共享
│   │   ├── types.ts             # TypeScript 类型定义（AppApiV2、SearchFilters 等）
│   │   ├── workerProtocol.ts    # 主进程 ↔ Worker 消息协议
│   │   ├── classifier.ts        # 规则分类器（11 个 AI 子分类）
│   │   └── ranking.ts           # 多因子排名算法
│   └── renderer/                # React 前端
│       ├── App.tsx              # 主界面，深色 IDE 主题
│       ├── components/
│       │   ├── CommandPalette.tsx  # Cmd+K 搜索，支持筛选和排序
│       │   └── SkeletonRow.tsx     # 骨架屏加载动画
│       ├── api.ts               # 前端 API（IPC + v2 方法）
│       ├── i18n.tsx             # 中英文国际化（35+ 翻译键）
│       └── styles.css           # 深色优先设计系统（Claude/Codex 风格）
├── build/                       # 构建资源（图标）
└── scripts/                     # 构建脚本
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | Electron 41 |
| **UI** | React 19 + Vite 8 |
| **语言** | TypeScript 6 |
| **数据库** | better-sqlite3（原生 SQLite + FTS5） |
| **状态管理** | @tanstack/react-query v5 |
| **HTTP** | undici（支持代理） |
| **图标** | lucide-react |
| **Markdown** | react-markdown + remark-gfm |
| **虚拟化列表** | @tanstack/react-virtual |
| **样式** | CSS 变量 + 深色优先 IDE 设计系统 |
| **打包** | electron-builder |

---

## Performance Optimizations

- **Native SQLite** — better-sqlite3 synchronous API, no WASM overhead
- **FTS5 full-text search** — Virtual table with bm25 ranking, trigram tokenizer
- **Worker process isolation** — Database and crawling in `utilityProcess`, zero UI jank
- **Transaction batch writes** — All repo ingestion wrapped in SQLite transactions
- **PRAGMA tuning** — WAL journal mode, NORMAL synchronous, 16MB cache, MEMORY temp store
- **Query cache** — In-memory TTL cache with automatic invalidation on writes
- **N+1 query fix** — Batch IN queries (401 queries → 3 for 200 repos)
- **Smart retry** — Exponential backoff with jitter for API resilience
- **ETag caching** — Conditional HTTP requests to minimize bandwidth
- **Concurrent adapters** — All 6 sources run via `Promise.allSettled` per window
- **Code splitting** — Vite 8 manual chunks: react-core, query, markdown, virtual, ui-icons
- **Build optimization** — Minification, sourcemap removal, tree shaking

---

## 性能优化

- **原生 SQLite** — better-sqlite3 同步 API，无 WASM 开销
- **FTS5 全文搜索** — 虚拟表配合 bm25 排序，unicode61 分词器
- **Worker 进程隔离** — 数据库和爬取运行在 `utilityProcess` 中，UI 零卡顿
- **事务批量写入** — 所有仓库入库包裹在 SQLite 事务中
- **PRAGMA 调优** — WAL 日志模式、NORMAL 同步、16MB 缓存、MEMORY 临时存储
- **查询缓存** — 内存 TTL 缓存，写入时自动失效
- **N+1 查询修复** — 批量 IN 查询（200 个仓库：401 次查询 → 3 次）
- **智能重试** — 指数退避 + 抖动，增强 API 弹性
- **ETag 缓存** — 条件请求减少带宽消耗
- **并发适配器** — 6 个数据源通过 `Promise.allSettled` 按窗口并发
- **代码分割** — Vite 8 手动分包：react-core、query、markdown、virtual、ui-icons
- **构建优化** — 代码压缩、sourcemap 移除、tree shaking

---

## Data Storage & Backup

### Local SQLite Database

All data stored locally via `better-sqlite3` (native SQLite):

- Repositories, source observations, snapshots
- Classifications, ranking scores, evidence trails
- FTS5 search index (`repo_search` virtual table)
- AI summary cache (`repo_summaries` table)
- User notes, tags, alert rules
- Refresh job history, rate limit states
- Request cache with ETag support, manual classification rules

16 performance indexes ensure fast queries even with large datasets.

### Backup

Click **Backup data** in Settings. SQLite file is copied to the configured backup directory.

---

## 数据存储与备份

### 本地 SQLite 数据库

所有数据通过 `better-sqlite3`（原生 SQLite）存储在本地：

- 仓库、来源观测、快照
- 分类、排名分数、证据链
- FTS5 搜索索引（`repo_search` 虚拟表）
- AI 摘要缓存（`repo_summaries` 表）
- 用户笔记、标签、告警规则
- 刷新任务历史、速率限制状态
- 请求缓存（支持 ETag）、手动分类规则

16 个性能索引确保大数据集下的快速查询。

### 备份

在设置中点击 **备份数据**。SQLite 文件将复制到配置的备份目录。

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode (Vite HMR + Electron) |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm start` | Build and launch app |
| `npm run dist:win` | Package Windows x64 (NSIS + Portable) |
| `npm run dist:mac` | Package macOS (DMG + Zip) |
| `npm run dist:linux` | Package Linux (AppImage + deb + rpm) |
| `npm run dist:all` | Package all platforms |
| `npm test` | Run tests |
| `npm run preview` | Browser UI preview |

---

## 脚本命令

| 命令 | 描述 |
|------|------|
| `npm run dev` | 开发模式（Vite HMR + Electron） |
| `npm run build` | 生产构建（TypeScript + Vite） |
| `npm start` | 构建并启动应用 |
| `npm run dist:win` | 打包 Windows x64（NSIS + 便携版） |
| `npm run dist:mac` | 打包 macOS（DMG + Zip） |
| `npm run dist:linux` | 打包 Linux（AppImage + deb + rpm） |
| `npm run dist:all` | 打包所有平台 |
| `npm test` | 运行测试 |
| `npm run preview` | 浏览器 UI 预览 |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Open Command Palette (search, filter, sort) |
| `/` | Focus search input |
| `Ctrl+R` / `Cmd+R` | Trigger data refresh |
| `Esc` | Close Command Palette / Cancel operation |

---

## 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl+K` | 打开命令面板（搜索、筛选、排序） |
| `/` | 聚焦搜索框 |
| `Ctrl+R` / `Cmd+R` | 触发数据刷新 |
| `Esc` | 关闭命令面板 / 取消操作 |

---

## Roadmap

- [x] FTS5 full-text search engine
- [x] Dark mode toggle with theme persistence
- [x] Advanced search filters (window, category, language, stars, favorites)
- [x] Worker process isolation for non-blocking UI
- [x] AI-powered repository summaries with streaming
- [x] Command Palette with keyboard navigation
- [x] Virtual scroll for large datasets
- [x] Native SQLite via better-sqlite3
- [ ] GitHub GraphQL API migration
- [ ] Local AI model integration (Ollama/llama.cpp)
- [ ] Browser extension for capturing repos
- [ ] Data sync via encrypted Gist backup

---

## 路线图

- [x] FTS5 全文搜索引擎
- [x] 深色模式切换，主题持久化
- [x] 高级搜索筛选（窗口、分类、语言、星标、收藏）
- [x] Worker 进程隔离，UI 无阻塞
- [x] AI 驱动的仓库摘要，流式输出
- [x] 命令面板，键盘导航
- [x] 大数据集虚拟滚动
- [x] 原生 SQLite (better-sqlite3)
- [ ] GitHub GraphQL API 迁移
- [ ] 本地 AI 模型集成（Ollama/llama.cpp）
- [ ] 浏览器扩展捕获仓库
- [ ] 加密 Gist 备份数据同步

---

## Troubleshooting

**GitHub API Rate Limit (403):** Configure a GitHub Token. Wait ~1 hour for rate limit reset.

**Network Timeout:** Check access to `https://api.github.com`. Configure a proxy in Settings.

**Telegram/X Degraded:** Non-critical sources. The adapter skips inaccessible channels automatically.

**Refresh Succeeds But No Data:** Switch time windows. Check category filters. Visit Data Sources page.

**Browser Preview Cannot Refresh:** Expected. Live refresh requires Electron (`npm start` or `npm run dev`).

---

## 常见问题

**GitHub API 速率限制 (403)：** 配置 GitHub Token，或等待约 1 小时速率限制重置。

**网络超时：** 检查对 `https://api.github.com` 的访问。在设置中配置代理。

**Telegram/X 降级：** 非关键数据源。适配器会自动跳过不可访问的频道。

**刷新成功但无数据：** 切换时间窗口，检查分类筛选，访问数据源页面。

**浏览器预览无法刷新：** 这是预期行为。实时刷新需要 Electron 环境（`npm start` 或 `npm run dev`）。

---

## Contributing

Contributions are welcome! Please follow the commit convention:

```
<type>(<scope>): <subject>

Types: feat, fix, perf, style, refactor, test, docs, chore, ci
Scopes: ui, perf, db, api, build, deps
```

---

## 贡献

欢迎贡献代码！请遵循以下提交规范：

```
<type>(<scope>): <subject>

Types: feat, fix, perf, style, refactor, test, docs, chore, ci
Scopes: ui, perf, db, api, build, deps
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

## 许可证

MIT 许可证 — 详见 [LICENSE](LICENSE)。

---

<div align="center">
  <p>Built with Electron, React, and TypeScript. Inspired by Claude.ai design language.<br>
  基于 Electron、React 和 TypeScript 构建。设计灵感来自 Claude.ai。</p>
  <p>
    <a href="https://github.com/zrz2004/GithubSearch">GitHub</a> •
    <a href="https://github.com/zrz2004/GithubSearch/issues">Report Bug / 报告问题</a> •
    <a href="https://github.com/zrz2004/GithubSearch/discussions">Discussions / 讨论</a>
  </p>
</div>
