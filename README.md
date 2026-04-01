# ctxlens

**Token budget analyzer for AI context windows — like `du` for tokens.**

Every developer using AI coding tools hits the same wall: *"Does my codebase fit in context?"* You paste files until the model complains, guess at what to include, and hope for the best. ctxlens gives you the answer in one command.

```bash
npx ctxlens scan
```

## Why ctxlens

**You can't optimize what you don't measure.** AI models have hard context limits — 128k, 200k, 1M tokens — and your codebase is competing for space with prompts, conversation history, and tool output. ctxlens tells you exactly where your token budget goes.

### Problems it solves

- **"Will my project fit in context?"** — Instant answer across 22 models from 7 providers. Know you're safe on Claude, tight on GPT-4o, and blown past Grok — without switching tools.
- **"Which files are eating my budget?"** — Ranked breakdown by file and directory, with bar charts. Find the token hogs the same way `du` finds disk hogs.
- **"How much would I save by stripping comments?"** — The `diff` command shows exact token savings before you change anything. Budget simulation, not guesswork.
- **"Can I gate PRs on context budget?"** — `--ci` flag exits non-zero when a threshold is exceeded. Same pattern as bundle size checks.
- **"Which tokenizer should I care about?"** — Side-by-side comparison of cl100k_base vs o200k_base. Relevant when switching between Claude and GPT families.
- **"Is my repo getting bloated for AI?"** — Real-time monitoring with `watch` mode. See utilization change as you code.

### Privacy first

ctxlens is **fully offline**. Zero network calls, zero telemetry, zero data collection.

- Runs entirely on your machine — no API keys, no accounts, no cloud
- Never transmits file contents, paths, or token counts anywhere
- HTML reports are self-contained — no external CDN, no analytics, no tracking pixels
- If you're counting tokens for a proprietary codebase, this is the only option that doesn't involve pasting code into a web tool

### How it works

1. **Scan** — Walks the directory tree, respecting `.gitignore` and a built-in ignore list (binaries, images, lock files, build output, `node_modules`, etc.). Binary files are detected and skipped. Files over 10 MB are skipped.

2. **Tokenize** — Each file is run through [tiktoken](https://github.com/dqbd/tiktoken) (WASM build) using the encoding for the target model. Encoders are cached across files for performance.

3. **Budget** — Token counts are aggregated per file and per directory, then compared against the model's context window. Thresholds: **fits** (≤ 80%), **tight** (80–100%), **exceeds** (> 100%).

4. **Render** — Results are formatted for the selected output: rich terminal, JSON, HTML report, or quiet one-liner.

## Install

```bash
# Run directly — no install needed
npx ctxlens scan

# Or install globally
npm install -g ctxlens

# Or as a dev dependency for CI
npm install --save-dev ctxlens
```

Requires Node.js 18+.

## Quick start

```bash
ctxlens init                # Create a .ctxlensrc config (interactive)
ctxlens scan                # Scan and report token usage
ctxlens scan --ci 90        # Gate PRs on budget threshold
ctxlens diff --ref main     # Token impact of changes since main
ctxlens optimize            # Get actionable suggestions
```

## Commands

### `ctxlens init [path]`

Scaffold a `.ctxlensrc` config file with interactive prompts. Asks for default model, directory depth, top-N count, and ignore patterns.

```bash
ctxlens init            # Interactive setup
ctxlens init --yes      # Accept all defaults, no prompts
```

### `ctxlens scan [path]`

The core command. Scans a directory, tokenizes every file, and reports token counts with budget analysis.

```bash
# Scan current directory (default model: claude-sonnet-4-6)
ctxlens scan

# Scan a specific path against a specific model
ctxlens scan ./src --model gpt-4.1

# Adjust directory depth and top-N count
ctxlens scan --depth 4 --top 20
```

**Output formats:**

```bash
ctxlens scan                  # Rich terminal output with bar charts (default)
ctxlens scan --json           # JSON for CI pipelines and scripting
ctxlens scan --quiet          # One-liner: total tokens and status
ctxlens scan --report         # Interactive HTML report with treemap
```

**File filtering:**

```bash
ctxlens scan --include "**/*.ts" "**/*.tsx"    # Only scan TypeScript files
ctxlens scan --exclude "**/*.test.ts"          # Exclude test files
ctxlens scan --ignore "docs/" "*.md"           # Extra ignore patterns
ctxlens scan --no-gitignore                    # Don't respect .gitignore
```

**Content stripping:**

```bash
ctxlens scan --strip-comments      # Strip comments before tokenizing
ctxlens scan --strip-whitespace    # Collapse excess whitespace
```

**Tokenizer comparison:**

```bash
ctxlens scan --compare    # Side-by-side: cl100k_base vs o200k_base
```

**CI mode:**

```bash
ctxlens scan --ci          # Exit 1 if utilization > 100%
ctxlens scan --ci 80       # Exit 1 if utilization > 80%
```

Outputs JSON for machine consumption and exits with code 1 if the threshold is exceeded. Use in GitHub Actions, GitLab CI, or any pipeline.

**Sorting and display:**

```bash
ctxlens scan --sort name       # Sort directories and files alphabetically
ctxlens scan --sort files      # Sort directories by file count
ctxlens scan --top 0           # Show all files/directories (no limit)
```

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model for budget calculation | `claude-sonnet-4-6` |
| `-d, --depth <n>` | Directory tree depth for aggregation | `3` |
| `-t, --top <n>` | Show top N files/dirs (`0` = all) | `10` |
| `-s, --sort <key>` | Sort by: `tokens`, `files`, `name` | `tokens` |
| `-o, --output <file>` | Write output to a file instead of stdout | — |
| `--ignore <patterns...>` | Additional ignore patterns | — |
| `--no-gitignore` | Don't respect .gitignore | — |
| `--json` | Output JSON | — |
| `--include <patterns...>` | Only include matching files | — |
| `--exclude <patterns...>` | Exclude matching files | — |
| `-q, --quiet` | Minimal output | — |
| `--compare` | Compare token counts across tokenizers | — |
| `--report` | Generate interactive HTML report | — |
| `--strip-comments` | Strip comments before tokenizing | — |
| `--strip-whitespace` | Collapse whitespace before tokenizing | — |
| `--ci [threshold]` | CI gate — exit non-zero if utilization exceeds threshold (%) | `100` |

### `ctxlens budget [path]`

Simulate context strategies — *"if I give the AI only these files, how much budget do I use?"*

```bash
ctxlens budget                                          # All files (same as scan)
ctxlens budget --strategy changed                       # Only git-modified files
ctxlens budget --strategy staged                        # Only staged files
ctxlens budget --strategy "src/core/**,src/utils/**"    # Custom glob patterns
ctxlens budget --strip-comments --quiet                 # Simulate without comments
```

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model | `claude-sonnet-4-6` |
| `-s, --strategy <s>` | `all`, `changed`, `staged`, or comma-separated glob patterns | `all` |
| `-d, --depth <n>` | Directory tree depth | `3` |
| `-t, --top <n>` | Show top N entries | `10` |
| `-o, --output <file>` | Write output to a file instead of stdout | — |
| `--json` | JSON output | — |
| `-q, --quiet` | Minimal output | — |
| `--strip-comments` | Strip comments before tokenizing | — |
| `--strip-whitespace` | Collapse whitespace before tokenizing | — |

### `ctxlens diff [path]`

Show the token impact of stripping, changes, or differences between git refs. Answers *"how many tokens would I save?"* and *"how did tokens change since main?"*

```bash
ctxlens diff --strip-comments                    # Token savings from stripping comments
ctxlens diff --strip-comments --strip-whitespace  # Combined savings
ctxlens diff                                      # Token counts of git-changed files
ctxlens diff --ref main                           # Token delta: current vs a git ref
ctxlens diff --ref HEAD~3                         # Token delta: current vs 3 commits ago
```

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model for tokenization | `claude-sonnet-4-6` |
| `--strip-comments` | Compare current vs comment-stripped | — |
| `--strip-whitespace` | Compare current vs whitespace-collapsed | — |
| `--ref <ref>` | Compare current tokens to a git ref (e.g. `HEAD~1`, `main`) | — |

### `ctxlens optimize [path]`

Analyze the codebase and get actionable suggestions for reducing token usage.

```bash
ctxlens optimize
```

**What it flags:**
- **Oversized files** — files that take a disproportionate share of your budget (≥ 2000 tokens AND > 3x their fair share)
- **Comment-heavy files** — shows estimated token savings from stripping (≥ 40% comments)
- **Test files** — total test token weight with exclusion advice
- **Type-dense files** (positive signal) — type definitions give AI models high signal per token

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model | `claude-sonnet-4-6` |

### `ctxlens watch [path]`

Real-time token budget monitoring. Re-scans on file changes with a live status line.

```bash
ctxlens watch                  # Watch with default 80% threshold
ctxlens watch --threshold 60   # Warn earlier
```

Press Ctrl+C to stop. Uses 300ms debounce to avoid thrashing on rapid saves.

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model | `claude-sonnet-4-6` |
| `--threshold <pct>` | Warn when utilization exceeds this percentage | `80` |

### `ctxlens models`

List all 22 supported models with context window sizes, tokenizer assignments, and approximation markers.

```bash
ctxlens models
```

## Example output

```
  ctxlens — Token Budget Analyzer

  Model: claude-sonnet-4-6 (200.0k tokens)
  Scanned: 847 files
  Total tokens: 623.4k (62.3% of context window)

  ── Top directories by token count ──────────────────────────────

  src/components/            148.2k tk  ██████████████░░░░  23.8%
  src/services/               97.6k tk  █████████░░░░░░░░░  15.7%
  src/utils/                  64.9k tk  ██████░░░░░░░░░░░░  10.4%
  tests/                      58.4k tk  █████░░░░░░░░░░░░░   9.4%
  docs/                       41.2k tk  ████░░░░░░░░░░░░░░   6.6%

  ── Largest files ──────────────────────────────────────────────

  src/components/DataGrid.tsx               12.8k tk  (2.1%)
  src/services/api-client.ts                 9.2k tk  (1.5%)
  src/utils/validators.ts                    8.1k tk  (1.3%)

  ── Budget status ──────────────────────────────────────────────

  ✓ Fits in context: claude-sonnet-4-6 (200.0k) — 62.3%
  ✓ Fits in context: gpt-4.1 (1.0M) — 12.5%
  ⚠ Tight fit:      gpt-4o (128.0k) — 97.5%
```

## HTML report

`ctxlens scan --report` generates a self-contained HTML file with:

- Interactive **treemap visualization** — click to drill into directories
- **Top directories** and **largest files** tables with bar charts
- **Multi-model budget status** — color-coded fit/tight/exceeds indicators
- **Tokenizer comparison** table — cl100k_base vs o200k_base side-by-side
- Dark theme, no external dependencies, opens in your default browser

## Supported models

22 models across 7 providers:

| Model | Provider | Context Window | Tokenizer |
|-------|----------|---------------|-----------|
| claude-opus-4-6 | Anthropic | 200k | cl100k_base |
| claude-sonnet-4-6 | Anthropic | 200k | cl100k_base |
| claude-haiku-4-5 | Anthropic | 200k | cl100k_base |
| gpt-5.4 | OpenAI | 1M | o200k_base |
| gpt-5.4-mini | OpenAI | 1M | o200k_base |
| gpt-4.1 | OpenAI | 1M | o200k_base |
| gpt-4.1-mini | OpenAI | 1M | o200k_base |
| gpt-4o | OpenAI | 128k | o200k_base |
| o3 | OpenAI | 200k | o200k_base |
| o4-mini | OpenAI | 200k | o200k_base |
| gemini-3.1-pro | Google | 1M | cl100k_base \* |
| gemini-3.1-flash | Google | 1M | cl100k_base \* |
| gemini-2.5-pro | Google | 1M | cl100k_base \* |
| gemini-2.5-flash | Google | 1M | cl100k_base \* |
| grok-4.20 | xAI | 256k | cl100k_base \* |
| grok-3 | xAI | 131k | cl100k_base \* |
| llama-4-scout | Meta | 10M | cl100k_base \* |
| llama-4-maverick | Meta | 1M | cl100k_base \* |
| deepseek-v3 | DeepSeek | 131k | cl100k_base \* |
| deepseek-r1 | DeepSeek | 131k | cl100k_base \* |
| mistral-large | Mistral | 131k | cl100k_base \* |
| codestral | Mistral | 262k | cl100k_base \* |

\* Approximation — these models use different tokenizers natively. Token counts may vary ±10–15%. This is acceptable for budget planning — you're estimating context usage, not calculating billing.

### Custom models

Define your own models in `.ctxlensrc` for fine-tuned, private, or newly released models:

```json
{
  "customModels": {
    "my-finetuned": { "contextWindow": 32000, "tokenizer": "cl100k_base" },
    "internal-llm": { "contextWindow": 65536, "tokenizer": "o200k_base" }
  }
}
```

Custom models can be used with any command via `--model my-finetuned`.

## What gets ignored

The scanner skips these automatically (on top of `.gitignore` and `.ctxlensignore`):

| Category | Patterns |
|----------|----------|
| **Dependencies** | `node_modules`, `.venv`, `venv`, `__pycache__`, `.tox` |
| **Build output** | `dist`, `build`, `.next`, `.nuxt`, `coverage`, `target` |
| **Lock files** | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `*.lock` |
| **Binary/media** | Images, fonts, audio, video, archives, compiled objects |
| **Minified** | `*.min.js`, `*.min.css`, `*.map` |
| **AI tooling** | `.git`, `.claude` |
| **Large files** | Any file > 10 MB |

Use `--ignore` or `--exclude` to add patterns. Use `--no-gitignore` to skip `.gitignore` rules. You can also create a `.ctxlensignore` file (same syntax as `.gitignore`) for patterns specific to ctxlens.

## Configuration

Create a `.ctxlensrc` file in your project root, or add a `"ctxlens"` key to `package.json`:

```json
{
  "defaultModel": "claude-opus-4-6",
  "ignore": ["*.generated.ts", "coverage/"],
  "include": ["src/", "tests/"],
  "depth": 4,
  "top": 15,
  "customModels": {
    "my-model": { "contextWindow": 32000, "tokenizer": "cl100k_base" }
  }
}
```

**Resolution order:** CLI flag > `CTXLENS_MODEL` env var > `.ctxlensrc` / `package.json` > built-in default

| Config key | Type | Description |
|-----------|------|-------------|
| `defaultModel` | `string` | Default model when `--model` is not provided |
| `ignore` | `string[]` | Extra ignore patterns (stacked on defaults + .gitignore) |
| `include` | `string[]` | Include-only patterns |
| `depth` | `number` | Default directory tree depth |
| `top` | `number` | Default number of top entries to show |
| `customModels` | `object` | Custom model definitions (see above) |

## JSON output

The `--json` flag produces structured output for CI pipelines and scripting:

```json
{
  "version": "1.1.0",
  "repository": "my-project",
  "scannedAt": "04.01.2026 | 14:22:00",
  "totalFiles": 847,
  "totalTokens": 623418,
  "model": "claude-sonnet-4-6",
  "contextWindow": 200000,
  "utilization": 0.623,
  "status": "fits",
  "directories": [
    { "path": "src/components/", "tokens": 148230, "files": 42 }
  ],
  "files": [
    { "path": "src/components/DataGrid.tsx", "tokens": 12847, "lines": 487 }
  ]
}
```

## CI / GitHub Actions

### Using the published action

```yaml
# .github/workflows/context-check.yml
name: Context Check
on: [pull_request]
jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: kVadrum/ctxlens@v1
        with:
          model: claude-sonnet-4-6
          threshold: 90
```

| Input | Description | Default |
|-------|-------------|---------|
| `model` | Target model for budget calculation | `claude-sonnet-4-6` |
| `threshold` | Fail if utilization exceeds this % | `100` |
| `path` | Directory to scan | `.` |

### Using npx directly

```yaml
jobs:
  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npx ctxlens scan --ci 90
```

Both approaches fail the PR if the codebase exceeds the threshold.

## Tokenizer accuracy

ctxlens uses tiktoken encodings via [@dqbd/tiktoken](https://github.com/dqbd/tiktoken) (WASM):

- **cl100k_base** — exact for Claude and GPT-4 class models
- **o200k_base** — exact for GPT-4o, GPT-4.1, GPT-5.4, o3, o4-mini

For models using SentencePiece natively (Gemini, Llama, DeepSeek, Mistral, Grok), cl100k_base is used as an approximation. Token counts may differ by ±10–15% from the native tokenizer. For budget planning this is fine — you're making context allocation decisions, not calculating API billing.

## License

MIT — KeMeK Network © 2026
