# Star Intel Desk v1.0.0

Local-first desktop GitHub trending intelligence workspace. Track high-star and fast-growing repositories daily, classify across AI, developer tools, frontend, backend, data, security, infrastructure with 6 coordinated data sources and AI-powered classification.

本地优先的桌面 GitHub 趋势情报工作台，每日追踪高星与快速增长项目，覆盖 AI、开发工具、前端、后端、数据、安全、基础设施等方向。支持 GitHub、Telegram、X (Twitter) 六大数据源协同采集，AI 自动分类与排名。

---

## Quick Start

### Prerequisites

- **Node.js** >= 18 (recommended 20+)
- **npm** >= 9
- **Windows 10/11 x64**

### Install & Run

```powershell
git clone https://github.com/zrz2004/GithubSearch.git
cd GithubSearch
npm install
npm run dev
```

### Build Windows Installer

```powershell
npm run dist:win
```

Output in `release/`:

- `Star Intel Desk-1.0.0-win-x64.exe` — NSIS installer
- `win-unpacked/Star Intel Desk.exe` — portable executable

---

## Data Refresh Guide

This is the most important section for new users: how to successfully pull real data.

### Step 1: Open Settings

Launch the app and click **Settings** in the left sidebar.

### Step 2: Configure GitHub Token (Highly Recommended)

GitHub Token is the single most important configuration for successful data refresh.

**Why?**
- Without Token: GitHub API rate limit is **60 requests/hour** (by IP), refresh will fail
- With Token: rate limit increases to **5000 requests/hour**, enough for a full refresh
- Token also enables enhanced repository enrichment (descriptions, topics, licenses)

**How to create a Token:**

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `star-intel-desk`
4. Check **public_repo** scope (read-only public repos, no other permissions needed)
5. Generate and copy the token (format: `ghp_xxxxxxxx...`)

Paste it into the **GitHub Token** field in Settings, click **Save Settings**, then click **Test GitHub** to verify.

### Step 3: Configure Proxy (If Network is Restricted)

If you cannot access GitHub, Telegram, or other data sources directly, configure an HTTP proxy:

```
http://127.0.0.1:7890
http://127.0.0.1:1080
socks5://127.0.0.1:1080
```

### Step 4: Configure AI API Key (Optional)

Used for automatic classification refinement when rule-based classifier has low confidence. Supports any OpenAI-compatible endpoint (OpenAI, Ollama, Azure, etc.).

**Not required** — the rule-based classifier covers 11 AI subcategories with high accuracy.

### Step 5: Trigger Refresh

**Manual refresh (recommended for first-time users):**

Click the **Refresh** button in the top bar. The app will collect data across daily/weekly/monthly windows with all 6 data sources running concurrently.

**Scheduled refresh:**

Enable **Background Refresh** in Settings and set a **Refresh Time** (default: `08:30`). The app auto-refreshes once daily.

### Refresh Pipeline

```
Discover → Canonicalize → Observe → Snapshot → Classify → AI Review (optional) → Score → Alert
```

---

## Troubleshooting

### GitHub API Rate Limit (403)

**Symptom:** Refresh log shows `rate limit` or `403`.
**Fix:** Configure a GitHub Token (Step 2). Wait for the rate limit window to reset (~1 hour).

### Network Timeout

**Symptom:** All sources fail with `timeout`, `ECONNREFUSED`, `ENOTFOUND`.
**Fix:** Check network access to `https://api.github.com`. Configure a proxy (Step 3).

### Telegram Channels Unavailable

**Symptom:** Telegram source shows `degraded`.
**Fix:** Some Telegram channels may require login. The adapter skips inaccessible channels automatically. Ensure proxy allows `t.me`. This is a non-critical source.

### X (Twitter) Source Unstable

**Symptom:** X source shows `degraded`.
**Fix:** X relies on Nitter public instances which may go down. Supplemental feeds (HuggingFace Papers, PapersWithCode) still work. This is expected behavior.

### Refresh Succeeds But No Data

**Fix:** Switch time windows (try "Month"). Check category filters. Visit Data Sources page for health status.

### Browser Preview Cannot Refresh

**Fix:** Expected. Browser preview uses bundled sample data. Live refresh requires Electron (`npm start` or `npm run dev`).

---

## Six Data Sources

| Source | Description | Weight | Config |
|--------|-------------|--------|--------|
| GitHub Trending | Trending page scraping (daily/weekly/monthly) | 1.0 | None |
| GitHub Search API | 30+ AI-focused queries, concurrent execution | 0.9 | Token recommended |
| Telegram AI Channels | 10 curated AI channels via `t.me/s/` preview | 0.7 | None (needs `t.me` access) |
| X (Twitter) AI Signals | Nitter search + HuggingFace Papers + PapersWithCode | 0.65 | None |
| Supplemental Catalog | Curated cross-domain trend supplement | 0.45 | None |
| GH Archive WatchEvents | Real-time star event sampling from gharchive.org | 0.85 | None |

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

Also covers Developer Tools, Frontend, Backend, Data, Security, Infrastructure.

### AI Refinement (Optional)

Low-confidence classifications are sent to an OpenAI-compatible API for secondary confirmation. Skipped when no API key is configured.

### Manual Override

Users can manually reclassify any repository in the Classifier Lab. Overrides persist permanently and take priority over rules and AI.

---

## Feature Modules

| Module | Description |
|--------|-------------|
| Dashboard | Hot repos, category leaders, anomaly detection, source health |
| Trending Explorer | Browse trending repos by time window with search and filters |
| Category Intelligence | Distribution and ranking across 11+ categories |
| Compare | Side-by-side comparison of up to 5 repositories |
| Learning Hub | Export Markdown learning notes from saved repos |
| Alerts | Custom keyword/category/repository alert rules |
| Data Sources | Health status, weight, and coverage for all 6 sources |
| Classifier Lab | View and correct classification results |
| Settings | Token, proxy, AI config, refresh schedule, backup |

---

## Data Storage & Backup

### Local SQLite Database

All data stored locally via `sql.js` (WebAssembly SQLite):

- Repositories, source observations, snapshots
- Classifications, ranking scores
- User notes, tags, alert rules
- Refresh job history, rate limit states
- Request cache, manual classification rules

8 performance indexes ensure fast queries even with large datasets.

### Backup

Click **Backup data** in Settings. SQLite file is copied to the configured backup directory (or `backups/` in app data by default).

### Credential Security

GitHub Token and AI API Key are encrypted via Electron `safeStorage`. Sensitive values are redacted from runtime error messages.

---

## Project Structure

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
│       ├── App.tsx              # Main UI (900+ lines, 12 components)
│       ├── api.ts               # Frontend API (IPC + browser fallback)
│       ├── i18n.tsx             # EN/ZH internationalization
│       └── styles.css           # Claude/Anthropic-inspired styles
├── build/                       # Build assets (icons)
├── docs/                        # Supplementary documentation
├── scripts/                     # Build scripts
└── release/                     # Build output (gitignored)
```

---

## Performance Optimizations

- **N+1 query fix:** `listRepos` uses batch IN queries (401 queries → 3 for 200 repos)
- **Concurrent adapters:** All 6 sources run via `Promise.allSettled` per time window
- **Parallel search:** GitHub Search queries execute with concurrency limit of 4
- **Batch enrichment:** Repository detail fetching runs at concurrency 5
- **Request cache:** SHA256-hashed cache keys with configurable TTL (default 6 hours)
- **Concurrency control:** `runWithConcurrency` prevents request storms on social sources
- **8 SQLite indexes:** Optimized for batch queries, sorting, and cache expiration

---

## Tech Stack

- **Electron 42** — Desktop framework
- **React 19** — UI framework
- **Vite 8** — Build tool
- **TypeScript 6** — Type safety
- **sql.js** (SQLite WASM) — Local database
- **@tanstack/react-query** — Data fetching & cache
- **undici** — HTTP client with proxy support
- **lucide-react** — Icon library
- **electron-builder** — Packaging

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode (Vite HMR + Electron) |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm start` | Build and launch app |
| `npm run dist:win` | Package Windows x64 (NSIS + Portable) |
| `npm run pack:win` | Package unpacked Windows directory |
| `npm test` | Run tests |
| `npm run preview` | Browser UI preview |

---

## Browser Preview

```powershell
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`. Uses bundled sample data. Live refresh requires Electron.

---

## License

MIT
