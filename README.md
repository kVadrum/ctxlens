# ctxlens

Token budget analyzer for AI context windows — like `du` for tokens.

Scans a codebase, tokenizes every file, and tells you exactly how your project maps to AI model context windows.

## Install

```bash
npx ctxlens scan
```

## Usage

```bash
# Scan current directory
ctxlens scan

# Scan a specific path against a specific model
ctxlens scan ./src --model gpt-4.1

# JSON output for CI/scripting
ctxlens scan --json

# Minimal output
ctxlens scan --quiet

# List supported models
ctxlens models
```

## Status

v0.1.0 — early release. Core scanning and reporting functional.

A kVadrum project.
