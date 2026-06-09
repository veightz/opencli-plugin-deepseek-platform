# opencli-plugin-deepseek-platform

[![English](https://img.shields.io/badge/docs-English-1D4ED8?style=flat-square)](README.md)

在命令行查询 DeepSeek 平台余额和用量，基于 [OpenCLI](https://github.com/jackwener/OpenCLI) 构建。

## 命令

| 命令 | 说明 | 认证方式 |
|------|------|---------|
| `opencli deepseek-platform billing` | 查询账户余额 | `DEEPSEEK_API_KEY` 环境变量 |
| `opencli deepseek-platform usage` | 按月查询各模型用量与费用 | 浏览器会话（自动） |
| `opencli deepseek-platform usage-daily` | 按日查询用量与费用明细 | 浏览器会话（自动） |

## 安装

```bash
# 通过 opencli 插件管理器安装（推荐）
opencli plugin install github:veightz/opencli-plugin-deepseek-platform
```

或本地开发方式：

```bash
git clone https://github.com/veightz/opencli-plugin-deepseek-platform.git
cd opencli-plugin-deepseek-platform
opencli plugin install file://$(pwd)
```

或作为用户适配器（无需插件管理器）：

```bash
mkdir -p ~/.opencli/clis/deepseek-platform
curl -fsSL https://github.com/veightz/opencli-plugin-deepseek-platform/archive/main.tar.gz \
  | tar xz --strip=1 -C ~/.opencli/clis/deepseek-platform/
```

## 使用

### 查询余额（需要 API Key）

```bash
export DEEPSEEK_API_KEY="sk-xxxx"
opencli deepseek-platform billing -f table
```

### 按月用量（自动从浏览器会话获取）

```bash
# 需要在 Chrome 中登录 platform.deepseek.com
opencli deepseek-platform usage -f table
opencli deepseek-platform usage --month 5 --year 2026 -f yaml
```

### 按日明细

```bash
opencli deepseek-platform usage-daily -f table
opencli deepseek-platform usage-daily --model flash --top 5 -f table
opencli deepseek-platform usage-daily --month 5 --year 2026 -f csv
```

## 依赖

- [OpenCLI](https://github.com/jackwener/OpenCLI) v1.8+
- Chrome 浏览器，已安装 OpenCLI Browser Bridge 扩展并已连接
- 已登录 [platform.deepseek.com](https://platform.deepseek.com)

## 工作原理

- **billing** 通过 API Key 直接调用 `api.deepseek.com/user/balance`。
- **usage** / **usage-daily** 使用 OpenCLI 的浏览器桥接打开 `platform.deepseek.com/usage`，从 `localStorage` 提取会话 token，再调用平台内部 `/api/v0/usage/*` 接口。无需手动管理 token。

## 许可证

MIT
