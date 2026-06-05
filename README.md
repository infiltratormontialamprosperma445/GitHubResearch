<div align="center">
  <img src="build/icon.png" alt="Star Intel Desk" width="120" height="120">
  <h1>Star Intel Desk</h1>
  <h3>Local-First GitHub Intelligence Workspace</h3>
  <p>Track trending repositories with AI-powered classification across 6 data sources</p>

  <p>
    <a href="https://github.com/zrz2004/GithubSearch/releases/latest">
      <img src="https://img.shields.io/github/v/release/zrz2004/GithubSearch?style=flat-square&color=c2553a" alt="Release">
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
    <img src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square&logo=electron" alt="Electron">
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

## Features

- **Six Data Sources** — GitHub Trending, GitHub Search API, Telegram AI Channels, X (Twitter) AI Signals, GH Archive WatchEvents, Supplemental Catalog
- **AI Classification** — 11 AI subcategories with hundreds of keyword vectors, plus Developer Tools, Frontend, Backend, Data, Security, Infrastructure
- **Multi-Factor Ranking** — Growth score, source diversity, activity, quality, and risk penalty
- **Local-First** — SQLite database via sql.js (WASM), zero cloud dependency, full data privacy
- **Real-Time Updates** — Automated daily refresh with customizable schedule
- **Cross-Platform** — Windows, macOS, Linux with native installers
- **Bilingual** — English and Chinese interface
- **Desktop-Native** — Custom titlebar, frosted-glass topbar, keyboard shortcuts, dark mode support

### Feature Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Hot repos, category leaders, anomaly detection, source health overview |
| **Trending Explorer** | Browse trending repos by time window with search and category filters |
| **Category Intelligence** | Distribution across 11+ AI subcategories with top project rankings |
| **Compare** | Side-by-side comparison of up to 5 repositories with sparkline trends |
| **Learning Hub** | Export Markdown learning notes from saved repos |
| **Alerts** | Custom keyword, category, and repository alert rules |
| **Data Sources** | Health status, weight, and coverage metrics for all 6 sources |
| **Classifier Lab** | View and correct AI classification results with manual override |
| **Settings** | Token, proxy, AI config, refresh schedule, backup management |

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

Click the **Refresh** button or press `Ctrl+R`. The app collects data across daily/weekly/monthly windows with all 6 sources running concurrently.

### Refresh Pipeline

```
Discover → Canonicalize → Observe → Snapshot → Classify → AI Review → Score → Alert
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

## Architecture

### Project Structure

```
star-intel-desk/
├── electron/                    # Electron main process
│   ├── main.ts                  # App entry, window, IPC, scheduler
│   ├── preload.ts               # Context bridge (secure API)
│   ├── services/
│   │   ├── database.ts          # SQLite layer (sql.js WASM)
│   │   ├── intelligence.ts      # Core service (collect, classify, score)
│   │   └── aiClassifier.ts      # AI classification refinement
│   └── sources/
│       ├── types.ts             # SourceAdapter interface
│       ├── github.ts            # GitHub adapters (Trending, Search, Archive)
│       └── social.ts            # Social adapters (Telegram, Twitter/X)
├── src/
│   ├── shared/                  # Shared between main and renderer
│   │   ├── types.ts             # All TypeScript type definitions
│   │   ├── classifier.ts        # Rule-based classifier (11 AI subcategories)
│   │   └── ranking.ts           # Multi-factor ranking algorithm
│   └── renderer/                # React frontend
│       ├── App.tsx              # Main UI (1000+ lines, 15+ components)
│       ├── api.ts               # Frontend API (IPC + browser fallback)
│       ├── i18n.tsx             # EN/ZH internationalization
│       └── styles.css           # Claude/Anthropic-inspired design system
├── .github/workflows/           # CI/CD automation
│   └── release.yml              # Multi-platform build pipeline
├── build/                       # Build assets (icons)
├── docs/                        # Supplementary documentation
└── scripts/                     # Build scripts
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Electron 42 |
| **UI** | React 19 + Vite 8 |
| **Language** | TypeScript 6 |
| **Database** | sql.js (SQLite WASM) |
| **State** | @tanstack/react-query v5 |
| **HTTP** | undici (with proxy support) |
| **Icons** | lucide-react |
| **Styling** | CSS Variables + Claude-inspired design system |
| **Packaging** | electron-builder |
| **CI/CD** | GitHub Actions |

---

## Performance Optimizations

- **N+1 query fix** — Batch IN queries (401 queries → 3 for 200 repos)
- **Query cache** — In-memory TTL cache with automatic invalidation on writes
- **Smart retry** — Exponential backoff with jitter for API resilience
- **ETag caching** — Conditional HTTP requests to minimize bandwidth
- **Concurrent adapters** — All 6 sources run via `Promise.allSettled` per window
- **Parallel search** — GitHub Search queries execute with concurrency limit of 4
- **Batch enrichment** — Repository detail fetching at concurrency 5
- **16 SQLite indexes** — Optimized for batch queries, sorting, and cache expiration
- **Performance pragmas** — WAL mode, cache_size, temp_store tuning
- **Compression** — gzip/deflate Accept-Encoding for GitHub API responses

---

## Data Storage & Backup

### Local SQLite Database

All data stored locally via `sql.js` (WebAssembly SQLite):

- Repositories, source observations, snapshots
- Classifications, ranking scores, evidence trails
- User notes, tags, alert rules
- Refresh job history, rate limit states
- Request cache with ETag support, manual classification rules

16 performance indexes ensure fast queries even with large datasets.

### Backup

Click **Backup data** in Settings. SQLite file is copied to the configured backup directory.

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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Ctrl+R` / `Cmd+R` | Trigger data refresh |

---

## Roadmap

- [ ] Dark mode toggle in UI (CSS variables ready)
- [ ] Advanced search filters (`language:typescript stars:>1000`)
- [ ] FTS5 full-text search engine
- [ ] Virtual scroll for large datasets
- [ ] GitHub GraphQL API migration
- [ ] Local AI model integration (Ollama/llama.cpp)
- [ ] Browser extension for capturing repos
- [ ] Data sync via encrypted Gist backup

---

## Troubleshooting

**GitHub API Rate Limit (403):** Configure a GitHub Token. Wait ~1 hour for rate limit reset.

**Network Timeout:** Check access to `https://api.github.com`. Configure a proxy in Settings.

**Telegram/X Degraded:** Non-critical sources. The adapter skips inaccessible channels automatically.

**Refresh Succeeds But No Data:** Switch time windows. Check category filters. Visit Data Sources page.

**Browser Preview Cannot Refresh:** Expected. Live refresh requires Electron (`npm start` or `npm run dev`).

---

## Contributing

Contributions are welcome! Please follow the commit convention:

```
<type>(<scope>): <subject>

Types: feat, fix, perf, style, refactor, test, docs, chore, ci
Scopes: ui, perf, db, api, build, deps
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <p>Built with Electron, React, and TypeScript. Inspired by Claude.ai design language.</p>
  <p>
    <a href="https://github.com/zrz2004/GithubSearch">GitHub</a> •
    <a href="https://github.com/zrz2004/GithubSearch/issues">Report Bug</a> •
    <a href="https://github.com/zrz2004/GithubSearch/discussions">Discussions</a>
  </p>
</div>
