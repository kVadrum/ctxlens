# ctxlens

## Purpose
CLI tool that scans a codebase, tokenizes every file, and reports how the project maps to AI model context windows. Like `du` for tokens.

## Status
v1.0.0 — public release. 6 commands, HTML reports, CI mode, 47 tests.

## Stack
- TypeScript (ESM, Node 18+)
- Commander.js — CLI framework
- @dqbd/tiktoken — tokenization (WASM)
- chalk — terminal output
- ignore — .gitignore parsing
- esbuild — bundler
- vitest — testing
- tsx — dev runner

## Structure
```
src/
  cli/          # Command definitions (Commander.js)
    index.ts    # Entry point, command registration
    scan.ts     # scan command
    budget.ts   # budget strategies command
    optimize.ts # optimize command
    watch.ts    # watch command
    diff.ts     # diff command
    models.ts   # models command
  core/
    scanner.ts  # File discovery, .gitignore handling
    tokenizer.ts # Tokenization engine (wraps tiktoken)
    models.ts   # Model registry (context windows, tokenizer mappings)
    budget.ts   # Budget calculation logic
    optimizer.ts # Optimization analyzer
    stripper.ts # Comment/whitespace stripping
    git.ts      # Git integration (changed/staged files)
  output/
    terminal.ts # Rich terminal rendering
    json.ts     # JSON output
    html.ts     # Interactive HTML report with treemap
  utils/
    config.ts   # Config loader (.ctxlensrc / package.json)
    format.ts   # Shared formatting (formatTokens)
    version.ts  # Version constant (single source of truth)
tests/          # vitest test suite
models/
  registry.json # All supported models (data, not code)
```

## Commands
- `npm run dev` — run via tsx (no build needed)
- `npm run build` — bundle with esbuild
- `npm test` — run vitest
- `npm run lint` — type-check with tsc

## Conventions
- Model definitions live in `models/registry.json`, not in code
- Custom models can be defined in `.ctxlensrc` under `customModels`
- Tokenizer is abstracted behind `core/tokenizer.ts` for future swapping
- Scanner respects .gitignore by default + built-in ignore list for binaries/artifacts
- Version is centralized in `src/utils/version.ts` — update there, not in index.ts or package.json
- Use `execFileSync` (not `execSync`) for shell commands — security requirement
- Use DOM methods (not innerHTML) in HTML template JS — security requirement
