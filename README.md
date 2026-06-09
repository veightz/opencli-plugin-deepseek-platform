# deepseek-platform — opencli adapter

Query DeepSeek platform billing & usage from the command line, powered by [opencli](https://github.com/jackwener/opencli).

## Commands

| Command | Description | Auth |
|---------|-------------|------|
| `opencli deepseek-platform billing` | Account balance | `DEEPSEEK_API_KEY` env var |
| `opencli deepseek-platform usage` | Monthly token usage & cost by model | Browser session (auto) |
| `opencli deepseek-platform usage-daily` | Daily token usage breakdown | Browser session (auto) |

## Installation

```bash
# Clone adapter files
git clone https://github.com/veightz/deepseek-platform-adapter.git

# Copy to opencli local adapters
mkdir -p ~/.opencli/clis/deepseek-platform
cp deepseek-platform-adapter/*.js ~/.opencli/clis/deepseek-platform/
```

Or directly:

```bash
curl -fsSL https://github.com/veightz/deepseek-platform-adapter/archive/main.tar.gz \
  | tar xz --strip=1 -C ~/.opencli/clis/deepseek-platform/
```

## Usage

### Balance (requires API key)

```bash
# Set your API key
export DEEPSEEK_API_KEY="sk-xxxx"

# Query balance
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

- [opencli](https://github.com/jackwener/opencli) v1.8+
- Chrome with opencli Browser Bridge extension installed and connected
- Logged into [platform.deepseek.com](https://platform.deepseek.com)

## How it works

- **billing** calls `api.deepseek.com/user/balance` with your API key.
- **usage** / **usage-daily** use opencli's browser bridge to open `platform.deepseek.com/usage`, extract the session token from `localStorage`, and call the platform's internal `/api/v0/usage/*` endpoints. No manual token management needed.

## License

MIT
