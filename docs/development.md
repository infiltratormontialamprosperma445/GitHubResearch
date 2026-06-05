# Development Notes / 开发说明

## 中文

### 技术栈

- 桌面壳：Electron
- 前端：React + Vite + TypeScript
- 数据：`sql.js` 本地 SQLite
- 状态：TanStack Query
- 图标：lucide-react
- 测试：Vitest，视觉检查使用 Playwright

### 本地运行

```powershell
npm install
npm run dev
```

`npm run dev` 会编译 Electron 主进程，启动 Vite，并打开 Electron 桌面窗口。

### 构建、测试、预览

```powershell
npm run build
npm test
npm run preview -- --host 127.0.0.1 --port 4173
```

浏览器预览适合做 UI 检查，但会使用示例数据。真实采集、系统通知、加密存储和外部链接打开能力需要在 Electron 里验证。

### Windows 打包 Smoke Test

```powershell
npm run pack:win
.\release\win-unpacked\Star Intel Desk.exe
```

当前 `package.json` 中 Windows 构建配置了 `"signAndEditExecutable": false`，用于降低本机未签名 smoke test 的阻塞。正式发布需要补充图标、证书、安装包检查和升级策略。

### Windows 安装包发布

```powershell
npm run dist:win
```

该命令会生成 `build/icon.ico` / `build/icon.png`，执行生产构建，并输出 NSIS 安装器到当前版本号对应的 `release\Star Intel Desk-版本-win-x64.exe`。安装器配置会创建桌面快捷方式和开始菜单快捷方式。应用已设置 Windows `AppUserModelID`，运行时会按 Star Intel Desk 在任务栏中显示。

### 目录结构

- `src/shared`：共享类型、分类规则、排名逻辑。
- `src/renderer`：React 工作台 UI、浏览器预览 API、i18n。
- `electron/sources`：数据源适配器和 GitHub/GH Archive 采集。
- `electron/services`：数据库、刷新编排、AI 分类、设置、备份。
- `src/test`：分类、AI JSON 校验、排名等单元测试。
- `docs`：中英双语说明文档。

### 双语要求

界面文案集中在 `src/renderer/i18n.tsx`。新增 UI 文案时需要同时添加英文和中文键值。GitHub 仓库名称、仓库描述、topic、license 等外部数据不做强制翻译，避免改变原始语义。

### 发布前检查

每次重要改动前至少运行：

```powershell
npm run build
npm test
```

涉及 UI 的改动还应启动预览或 Electron，检查 Dashboard、Explorer、Settings、Classifier Lab、Data Sources 和窄窗口布局，确认没有文字溢出、重叠或破坏 Claude-style 色板。

### 开发边界

当前版本保持本地优先，不引入账号系统、云同步或多人协作。数据源扩展应通过 `SourceAdapter` 增加，不应把网络逻辑直接写进渲染进程。

## English

### Stack

- Desktop shell: Electron
- Frontend: React + Vite + TypeScript
- Data: local SQLite through `sql.js`
- State: TanStack Query
- Icons: lucide-react
- Tests: Vitest, with Playwright for visual checks

### Run Locally

```powershell
npm install
npm run dev
```

`npm run dev` compiles the Electron main process, starts Vite, and opens the Electron desktop window.

### Build, Test, Preview

```powershell
npm run build
npm test
npm run preview -- --host 127.0.0.1 --port 4173
```

Browser preview is useful for UI checks, but it uses bundled sample data. Live collection, notifications, secure storage, and external link handling should be verified in Electron.

### Windows Packaging Smoke Test

```powershell
npm run pack:win
.\release\win-unpacked\Star Intel Desk.exe
```

The current Windows build config sets `"signAndEditExecutable": false` in `package.json` to reduce friction for local unsigned smoke tests. A formal release should add icon assets, signing, installer validation, and update strategy.

### Windows Installer Release

```powershell
npm run dist:win
```

This command generates `build/icon.ico` / `build/icon.png`, runs the production build, and outputs the NSIS installer as `release\Star Intel Desk-version-win-x64.exe` for the current package version. The installer creates desktop and Start Menu shortcuts. The app also sets a Windows `AppUserModelID`, so it appears as Star Intel Desk in the taskbar while running.

### Project Layout

- `src/shared`: shared types, classifier rules, ranking logic.
- `src/renderer`: React workspace UI, browser preview API, i18n.
- `electron/sources`: source adapters and GitHub/GH Archive collection.
- `electron/services`: database, refresh orchestration, AI classification, settings, backups.
- `src/test`: unit tests for classification, AI JSON validation, ranking, and related logic.
- `docs`: bilingual explanatory documentation.

### Bilingual Requirement

UI strings live in `src/renderer/i18n.tsx`. Any new interface copy should add both English and Chinese entries. External GitHub data such as repository names, descriptions, topics, and licenses should not be force-translated, because those values are source facts.

### Pre-Release Checks

Run at least:

```powershell
npm run build
npm test
```

For UI changes, also run preview or Electron and inspect Dashboard, Explorer, Settings, Classifier Lab, Data Sources, and compact layouts. Confirm there is no overflow, overlap, or drift from the Claude-style color palette.

### Development Boundaries

The current product remains local-first. Do not add accounts, cloud sync, or collaboration flows unless the product scope changes. New sources should be implemented through `SourceAdapter`, not directly inside the renderer process.
