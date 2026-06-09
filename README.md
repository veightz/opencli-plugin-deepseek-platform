# opencli-plugin-deepseek-platform

[![中文](https://img.shields.io/badge/docs-中文-1D4ED8?style=flat-square)](README.zh-CN.md)

Query DeepSeek platform billing & usage from the command line, powered by [OpenCLI](https://github.com/jackwener/OpenCLI).

## Commands

| Command | Description | Auth |
|---------|-------------|------|
| `opencli deepseek-platform billing` | Account balance | Browser session (auto) |
| `opencli deepseek-platform apikey` | List API keys | Browser session (auto) |
| `opencli deepseek-platform apikey-create` | Create a new API key | Browser session (auto) |
| `opencli deepseek-platform usage` | Monthly token usage & cost by model | Browser session (auto) |
| `opencli deepseek-platform usage-daily` | Daily token usage & cost breakdown | Browser session (auto) |

## Installation

```bash
# Install via opencli plugin manager (recommended)
opencli plugin install github:veightz/opencli-plugin-deepseek-platform
```

Or as a local plugin for development:

```bash
git clone https://github.com/veightz/opencli-plugin-deepseek-platform.git
cd opencli-plugin-deepseek-platform
opencli plugin install file://$(pwd)
```

Or as a user adapter (no plugin manager needed):

```bash
mkdir -p ~/.opencli/clis/deepseek-platform
curl -fsSL https://github.com/veightz/opencli-plugin-deepseek-platform/archive/main.tar.gz \
  | tar xz --strip=1 -C ~/.opencli/clis/deepseek-platform/
```

## Usage

### Balance (auto from browser session)

```bash
# Must be logged into platform.deepseek.com in Chrome
opencli deepseek-platform billing -f table
```

### Monthly usage (auto from browser session)

```bash
# Must be logged into platform.deepseek.com in Chrome
opencli deepseek-platform usage -f table
opencli deepseek-platform usage --month 5 --year 2026 -f yaml
```

### Daily breakdown

```bash
opencli deepseek-platform usage-daily -f table
opencli deepseek-platform usage-daily --model flash --top 5 -f table
opencli deepseek-platform usage-daily --month 5 --year 2026 -f csv
```

## Requirements

- [OpenCLI](https://github.com/jackwener/OpenCLI) v1.8+
- Chrome with OpenCLI Browser Bridge extension installed and connected
- Logged into [platform.deepseek.com](https://platform.deepseek.com)

## How it works

- **billing** navigates to `platform.deepseek.com`, intercepts the page's API responses to find balance data. No API key needed.
- **usage** / **usage-daily** navigate to `platform.deepseek.com/usage`, extract the session token from `localStorage`, and call the platform's internal `/api/v0/usage/*` endpoints.

## License

MIT
