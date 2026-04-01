# ctxlens

Token budget analyzer for AI context windows — like `du` for tokens.

Scans a codebase, tokenizes every file, and tells you exactly how your project maps to AI model context windows. Answers the question every AI-assisted developer asks daily: **"What fits in context, and what doesn't?"**

## Quick start

No install required — run directly with npx:

```bash
npx ctxlens scan
```

Or install globally:

```bash
npm install -g ctxlens
```

## Usage

### Scan a directory

```bash
# Scan the current directory (default model: claude-sonnet-4-6)
ctxlens scan

# Scan a specific path
ctxlens scan ./src

# Scan against a specific model
ctxlens scan --model gpt-4.1

# Scan with a different tree depth and top-N count
ctxlens scan --depth 4 --top 20
```

### Output formats

```bash
# Rich terminal output (default) — colored, with bar charts
ctxlens scan

# JSON output for CI pipelines and scripting
ctxlens scan --json

# Minimal one-liner — just total tokens and status
ctxlens scan --quiet

# Interactive HTML report with treemap visualization
ctxlens scan --report
```

### CI mode

Use `--ci` to fail a build when token budget exceeds a threshold:

```bash
# Fail if utilization exceeds 100% (default)
ctxlens scan --ci

# Fail if utilization exceeds 80%
ctxlens scan --ci 80

# Use in a GitHub Actions workflow
ctxlens scan --model claude-sonnet-4-6 --ci 90
```

Outputs JSON for machine consumption and exits with code 1 if the threshold is exceeded.

### Token diff

Show the token impact of stripping comments or whitespace:

```bash
# How many tokens would you save by stripping comments?
ctxlens diff --strip-comments

# Strip both comments and whitespace
ctxlens diff --strip-comments --strip-whitespace

# Show token counts of changed files
ctxlens diff
```

### Filtering files

```bash
# Only scan TypeScript files
ctxlens scan --include "**/*.ts" "**/*.tsx"

# Exclude test files
ctxlens scan --exclude "**/*.test.ts" "**/*.spec.ts"

# Add extra ignore patterns (stacks with .gitignore)
ctxlens scan --ignore "docs/" "*.md"

# Don't respect .gitignore
ctxlens scan --no-gitignore
```

### Compare tokenizers

```bash
# Side-by-side token counts for cl100k_base vs o200k_base
ctxlens scan --compare
```

### Budget strategies

```bash
# Only count git-modified files
ctxlens budget --strategy changed

# Only count staged files
ctxlens budget --strategy staged

# Custom glob patterns
ctxlens budget --strategy "src/components/**,src/utils/**"

# Simulate without comments
ctxlens budget --strip-comments --quiet
```

### Optimization suggestions

```bash
ctxlens optimize
```

Flags oversized files, shows potential token savings from stripping comments, reports test file weight, and highlights type-dense files as efficient for AI context.

### Real-time monitoring

```bash
# Watch with default settings
ctxlens watch

# Watch with custom threshold
ctxlens watch --threshold 60
```

Re-scans on file changes and shows a live status line. Press Ctrl+C to stop.

### List supported models

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
| gemini-3.1-pro | Google | 1M | cl100k_base* |
| gemini-3.1-flash | Google | 1M | cl100k_base* |
| gemini-2.5-pro | Google | 1M | cl100k_base* |
| gemini-2.5-flash | Google | 1M | cl100k_base* |
| grok-4.20 | xAI | 256k | cl100k_base* |
| grok-3 | xAI | 131k | cl100k_base* |
| llama-4-scout | Meta | 10M | cl100k_base* |
| llama-4-maverick | Meta | 1M | cl100k_base* |
| deepseek-v3 | DeepSeek | 131k | cl100k_base* |
| deepseek-r1 | DeepSeek | 131k | cl100k_base* |
| mistral-large | Mistral | 131k | cl100k_base* |
| codestral | Mistral | 262k | cl100k_base* |

\* Approximation — these models use different tokenizers natively. Token counts may vary ±10–15%.

You can also define custom models in `.ctxlensrc`:

```json
{
  "customModels": {
    "my-finetuned": { "contextWindow": 32000, "tokenizer": "cl100k_base" }
  }
}
```

## CLI reference

### `ctxlens scan [path]`

Scan a directory and report token counts.

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model for budget calculation | `claude-sonnet-4-6` |
| `-d, --depth <n>` | Directory tree depth for aggregation | `3` |
| `-t, --top <n>` | Show top N files/directories | `10` |
| `--ignore <patterns...>` | Additional ignore patterns | — |
| `--no-gitignore` | Don't respect .gitignore | — |
| `--json` | Output JSON instead of terminal display | — |
| `--include <patterns...>` | Only include matching files | — |
| `--exclude <patterns...>` | Exclude matching files | — |
| `-q, --quiet` | Minimal output: total tokens and status | — |
| `--compare` | Compare token counts across tokenizers | — |
| `--report` | Generate interactive HTML report | — |
| `--strip-comments` | Strip comments before tokenizing | — |
| `--strip-whitespace` | Collapse excess whitespace before tokenizing | — |
| `--ci [threshold]` | Exit non-zero if utilization exceeds threshold | `100` |

### `ctxlens budget [path]`

Simulate context strategies against a model budget.

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model | `claude-sonnet-4-6` |
| `-s, --strategy <s>` | `all`, `changed`, `staged`, or glob patterns | `all` |
| `-d, --depth <n>` | Directory tree depth | `3` |
| `-t, --top <n>` | Show top N entries | `10` |
| `--json` | JSON output | — |
| `-q, --quiet` | Minimal output | — |
| `--strip-comments` | Strip comments before tokenizing | — |
| `--strip-whitespace` | Collapse whitespace before tokenizing | — |

### `ctxlens optimize [path]`

Analyze the codebase and suggest ways to reduce token usage.

### `ctxlens diff [path]`

Show token impact of changes or stripping.

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model for tokenization | `claude-sonnet-4-6` |
| `--strip-comments` | Compare current vs comment-stripped | — |
| `--strip-whitespace` | Compare current vs whitespace-collapsed | — |

Without strip flags, shows token counts of git-changed files.

### `ctxlens watch [path]`

Monitor token budget in real-time during development.

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <name>` | Target model | `claude-sonnet-4-6` |
| `--threshold <pct>` | Warn when utilization exceeds this percentage | `80` |

### `ctxlens models`

List all supported models with their context window sizes and tokenizers.

## How it works

1. **Scan** — Walks the directory tree, respecting `.gitignore` and a built-in list of ignored file types (binaries, images, lock files, build output, etc.). Files are checked for binary content and skipped if not text.

2. **Tokenize** — Each file's content is run through [tiktoken](https://github.com/dqbd/tiktoken) (WASM build) using the encoding appropriate for the target model. Encoders are cached and reused across files.

3. **Budget** — Token counts are aggregated per file and per directory, then compared against the target model's context window. Status thresholds: **fits** (≤ 80%), **tight** (80–100%), **exceeds** (> 100%).

4. **Render** — Results are formatted for the selected output mode (terminal, JSON, HTML, or quiet).

## What's ignored by default

The scanner skips these automatically (on top of `.gitignore`):

- **Dependencies:** `node_modules`, `.venv`, `__pycache__`, `.tox`
- **Build output:** `dist`, `build`, `.next`, `.nuxt`, `coverage`, `target`
- **Lock files:** `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `*.lock`
- **Binary/media:** images, fonts, audio, video, archives, compiled objects
- **Minified:** `*.min.js`, `*.min.css`, `*.map`

Use `--no-gitignore` to skip `.gitignore` rules, or `--ignore` / `--exclude` to add patterns.

## JSON output schema

The `--json` flag produces structured output suitable for CI pipelines:

```json
{
  "version": "0.4.0",
  "repository": "my-project",
  "scannedAt": "2026-04-01T14:22:00Z",
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

## Tokenizer accuracy

ctxlens uses tiktoken encodings via [@dqbd/tiktoken](https://github.com/dqbd/tiktoken) (WASM):

- **cl100k_base** — exact for Claude and GPT-4 models
- **o200k_base** — exact for GPT-4o, GPT-4.1, GPT-5.4, o3, o4-mini

For models that use SentencePiece natively (Gemini, Llama), cl100k_base is used as an approximation. Token counts may differ by ±10–15% from the model's native tokenizer. This is acceptable for a budget analyzer — you're planning context usage, not calculating billing.

## Configuration

Create a `.ctxlensrc` file in your project root (or add a `"ctxlens"` key to `package.json`):

```json
{
  "defaultModel": "claude-opus-4-6",
  "ignore": ["*.generated.ts", "coverage/"],
  "include": ["src/", "tests/"],
  "depth": 4,
  "top": 15,
  "customModels": {
    "my-finetuned": { "contextWindow": 32000, "tokenizer": "cl100k_base" }
  }
}
```

You can also set the `CTXLENS_MODEL` environment variable to override the default model.

Priority: CLI flag > `CTXLENS_MODEL` env var > `.ctxlensrc` > default

## Requirements

- Node.js 18+

## License

MIT — KeMeK Network © 2026

A kVadrum project.
