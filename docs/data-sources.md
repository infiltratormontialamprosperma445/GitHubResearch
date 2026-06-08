# Data Sources / 数据源说明

## 中文

GitHubResearch 将多个来源合并为同一个仓库实体，避免单一榜单带来的偏差。官方 GitHub 数据和本地历史快照优先，第三方或补充来源只作为交叉验证信号。

### GitHub Trending

抓取公开的 daily、weekly、monthly Trending 页面。这个来源偏向人工可见的热度信号，不需要凭据。

### GitHub Search API

通过官方仓库搜索查询高星、最近活跃、特定语言和高信号主题项目，例如 agents、MCP、LLM、RAG、developer tools。配置 GitHub Token 后可获得更高限流和更稳定的补全能力。

### GH Archive WatchEvents

采样 GH Archive 小时文件，统计 `WatchEvent` 作为独立星标增长证据。没有 BigQuery 时也可用于近期增长补充；配置 BigQuery 后可扩展到更深的历史回填。

### Supplemental Topic Sweep

围绕目标主题执行补充搜索，例如 AI agents、Claude skills、MCP tools、model serving、安全、基础设施和开发者工具。这些结果不会被当作唯一事实来源，只会增加排名和分类的交叉验证信号。

### 去重与可信度

去重优先使用 GitHub `node_id`，然后使用 `owner/name`、历史 rename 线索和来源命中合并。同一仓库多来源命中会合并为一个实体，并保存来源权重、观察次数、最佳排名和最大增长值。

### 数据质量

排名会保存来源拆解、去重置信度和异常原因。单来源暴涨、许可证不明、维护压力高、信息不足的项目仍会展示，但会在排名解释中显示风险扣分。

## English

GitHubResearch merges multiple source signals into one repository entity so the product is not dependent on a single chart. Official GitHub data and local historical snapshots are preferred; supplemental sources are used only as cross-check signals.

### GitHub Trending

Fetches the public daily, weekly, and monthly Trending pages. This source captures human-facing popularity and does not require credentials.

### GitHub Search API

Uses official repository search queries for stars, recent activity, languages, and high-signal topics such as agents, MCP, LLM, RAG, and developer tools. A GitHub Token improves rate limits and enrichment reliability.

### GH Archive WatchEvents

Samples GH Archive hourly files and counts `WatchEvent` records as independent star-growth evidence. It works as recent-growth enrichment without BigQuery, and can be expanded into deeper historical backfill when BigQuery is configured.

### Supplemental Topic Sweep

Runs targeted searches around AI agents, Claude skills, MCP tools, model serving, security, infrastructure, and developer tooling. These results are never treated as the only truth; they add cross-check evidence for ranking and classification.

### Dedupe And Confidence

Dedupe prefers GitHub `node_id`, then `owner/name`, rename hints, and source-observation merging. Multiple observations for the same repository are merged into one entity with source weight, observation count, best rank, and max growth preserved.

### Data Quality

Ranking stores source breakdown, dedupe confidence, and anomaly reasons. Projects with single-source spikes, unclear license, high maintenance pressure, or sparse metadata still appear, but the score explanation shows the risk penalty.
