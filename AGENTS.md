# OpenCLI 扩展参考

> 本项目 (`deepseek-platform-adapter`) 是一个 OpenCLI 适配器。本文档帮助理解 OpenCLI 的工作原理以及如何扩展它。

## 什么是 OpenCLI？

[OpenCLI](https://github.com/jackwener/OpenCLI) (`@jackwener/opencli`) 是一个 Node.js CLI 框架，把网站、API 和桌面应用变成确定性 CLI 命令。它提供：

- 100+ 内置适配器，支持 B站、知乎、小红书、Twitter/X、Reddit 等站点
- Browser Bridge Chrome 扩展 — 程序化驱动浏览器（导航、点击、填表单、提取数据）
- 社区插件系统
- 外部 CLI 透传 (`opencli external register`)
- 通过 CDP 控制 Electron 桌面应用

## 适配器架构

每个适配器是一个 `.js` 文件，通过 `@jackwener/opencli/registry` 导出配置：

```js
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'my-site',         // 组名，变成 `opencli my-site <command>`
  name: 'my-command',      // 命令名
  description: '...',      // 帮助信息
  access: 'read',          // 'read' | 'write'
  example: 'opencli my-site my-command -f table',
  domain: 'example.com',   // 关联域名
  strategy: Strategy.COOKIE, // Strategy.PUBLIC | Strategy.COOKIE | Strategy.INTERCEPT | Strategy.UI | Strategy.LOCAL
  browser: true,           // true = 需要 page 对象 (Browser Bridge)，false = 纯 HTTP
  navigateBefore: false,   // 是否让 OpenCLI 在调用 func 前先导航到 domain
  args: [
    { name: 'limit', type: 'int', default: 10, help: '最大结果数' },
    { name: 'format', type: 'string', help: '输出格式覆盖' },
  ],
  columns: ['Title', 'Url', 'Score'],

  // browser: false 时 — func 接收 (kwargs)
  // browser: true 时 — func 接收 (page, kwargs)
  func: async (page_or_kwargs, kwargs?) => {
    // 返回与 columns 匹配的行对象数组
    return [{ Title: 'foo', Url: 'https://...', Score: 100 }];
  },
});
```

### Strategy 枚举

| 策略 | 说明 |
|----------|-------------|
| `Strategy.PUBLIC` | 无需认证，纯 HTTP 请求 |
| `Strategy.COOKIE` | 使用浏览器会话 cookie（从 Browser Bridge 自动获取） |
| `Strategy.INTERCEPT` | 在浏览器中拦截网络请求 |
| `Strategy.UI` | 与页面 UI 元素交互 |
| `Strategy.LOCAL` | 使用本地凭证文件 |

## 扩展路径（5 种方式）

| 目标 | 方式 | 源码位置 | 入口 |
|------|--------|----------------|-------|
| 个人命令放在自己的 Git 仓库 | 本地插件 | 项目目录，symlink 到 `~/.opencli/plugins/` | `opencli <site> <cmd>` |
| 快速只本机用的适配器 | 用户适配器 | `~/.opencli/clis/<site>/<command>.js` | `opencli <site> <cmd>` |
| 覆盖官方适配器 | 适配器覆盖 | `~/.opencli/clis/<site>/`（遮盖 package） | `opencli <site> <cmd>` |
| 发布/安装第三方 | 插件 | Git 仓库 → `~/.opencli/plugins/` | `opencli <site> <cmd>` |
| 包装已有本地工具 | 外部 CLI | `~/.opencli/external-clis.yaml` | `opencli <tool> ...` |

### 创建本地插件

```bash
opencli plugin create my-plugin
cd my-plugin
git init
opencli plugin install file://$(pwd)
# 在 my-plugin/*.js 中写命令
opencli my-plugin hello
```

### 安装插件

```bash
opencli plugin install github:user/opencli-plugin-repo
opencli plugin install github:user/repo/subplugin  # monorepo
opencli plugin install file:///absolute/path/to/plugin
opencli plugin list
opencli plugin update --all
opencli plugin uninstall my-plugin
```

### 插件目录结构

```
my-plugin/
  package.json          # { "name": "opencli-plugin-my-plugin", "type": "module" }
  opencli-plugin.json   # 可选清单
  command1.js
  command2.js
```

### 通过 `opencli-plugin.json` 管理 Monorepo 插件

```json
{
  "version": "1.0.0",
  "plugins": {
    "cnn": { "path": "packages/cnn" },
    "reuters": { "path": "packages/reuters" }
  }
}
```

### 外部 CLI 透传

```bash
opencli external register my-tool --binary my-tool --install "npm i -g my-tool" --desc "My CLI"
opencli my-tool --help
```

## 适配器模式（来自本仓库）

### 模式 A：纯 HTTP（无浏览器）

```js
// billing.js
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'billing',
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [{ name: 'api-key' }],
  columns: ['Currency', 'TotalBalance', 'Available'],
  func: async (kwargs) => {
    const apiKey = kwargs['api-key'] || process.env.DEEPSEEK_API_KEY;
    const res = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json();
    return (data.balance_infos || []).map(info => ({
      Currency: info.currency,
      TotalBalance: info.total_balance,
      Available: data.is_available !== false ? 'Yes' : 'No',
    }));
  },
});
```

### 模式 B：Browser Bridge（从 localStorage 提取 token，调用内部 API）

```js
// usage.js
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'deepseek-platform',
  name: 'usage',
  domain: 'platform.deepseek.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  args: [{ name: 'month', type: 'int', default: 0 }],
  columns: ['Model', 'Requests', 'CostCNY'],
  func: async (page, kwargs) => {
    await page.goto('https://platform.deepseek.com/usage');
    await page.wait({ selector: 'main', timeout: 15 });

    const result = await page.evaluate(async ({ month, year }) => {
      const raw = localStorage.getItem('userToken');
      const token = JSON.parse(raw).value;
      const res = await fetch(`/api/v0/usage/amount?month=${month}&year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.data.biz_data.total.map(m => ({ Model: m.model, Requests: '...' }));
    }, { month, year });

    return result;
  },
});
```

浏览器适配器要点：
- `navigateBefore: false` 表示适配器自己处理导航
- `page.goto()` 导航到目标页面
- `page.wait()` 等待元素，带超时
- `page.evaluate()` 在浏览器上下文中执行 JS（提取 token、调用内部 API）
- 从 `localStorage` 提取 token 是 SPA 站点的常见模式

## 输出格式

所有内置命令都支持 `--format` / `-f`：

| 格式 | 标志 |
|--------|------|
| 表格（默认） | `-f table` |
| JSON | `-f json` |
| YAML | `-f yaml` |
| Markdown | `-f md` |
| CSV | `-f csv` |

也支持 `-v`（详细/调试模式）。

## 退出码

| 码 | 含义 |
|------|--------|
| 0 | 成功 |
| 66 | 无数据 |
| 69 | Browser Bridge 未连接 |
| 75 | 超时 |
| 77 | 需要认证 |
| 78 | 配置错误 |
| 130 | Ctrl-C |

## AI Agent Skill

通过 `npx skills add jackwener/opencli` 安装 OpenCLI 的 AI 技能：

- **opencli-adapter-author** — 为新站点写适配器
- **opencli-autofix** — 修复损坏的适配器
- **opencli-browser** — 实时驱动 Chrome（导航、点击、输入、填充、提取）
- **opencli-browser-sitemap** — 使用站点 sitemap 进行浏览器任务
- **opencli-sitemap-author** — 创建/更新站点 sitemap
- **opencli-usage** — 命令快速参考

## Browser Bridge 命令

`opencli browser <session> <cmd>`:
`open`, `state`, `click`, `type`, `fill`, `select`, `keys`, `wait`, `get`, `find`, `extract`, `frames`, `screenshot`, `scroll`, `back`, `eval`, `network`, `tab list/new/select/close`, `init`, `verify`, `close`

## 环境变量

| 变量 | 默认值 | 说明 |
|----------|---------|-------------|
| `OPENCLI_DAEMON_PORT` | `19825` | daemon-extension 通信端口 |
| `OPENCLI_WINDOW` | — | `foreground` 或 `background` |
| `OPENCLI_BROWSER_CONNECT_TIMEOUT` | `30` | 浏览器连接超时（秒） |
| `OPENCLI_BROWSER_COMMAND_TIMEOUT` | `60` | 浏览器命令超时（秒） |
| `OPENCLI_CDP_ENDPOINT` | — | CDP 端点，用于远程浏览器或 Electron |
| `OPENCLI_CDP_TARGET` | — | 按 URL 子串过滤 CDP target |
| `OPENCLI_VERBOSE` | `false` | 详细日志 |

## 源文档 URL（实时 — 重新获取最新内容）

> 需要重新查阅时，始终使用下面的 `main` 分支 URL 获取最新版本。

- [README.zh-CN.md](https://github.com/jackwener/OpenCLI/blob/main/README.zh-CN.md) — 项目总览（中文）
- [README.md (EN)](https://github.com/jackwener/OpenCLI/blob/main/README.md) — 项目总览（英文）
- [扩展 OpenCLI 指南](https://github.com/jackwener/OpenCLI/blob/main/docs/zh/guide/extending-opencli.md) — 5 种扩展路径
- [插件指南](https://github.com/jackwener/OpenCLI/blob/main/docs/zh/guide/plugins.md) — 插件目录结构和发布
- [OpenCLI GitHub](https://github.com/jackwener/OpenCLI) — 仓库
- 包：`@jackwener/opencli` (npm)
- 导入：`import { cli, Strategy } from '@jackwener/opencli/registry'`

