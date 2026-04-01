/**
 * `ctxlens init` command.
 *
 * Scaffolds a `.ctxlensrc` config file in the current directory with
 * sensible defaults. Asks a few questions via readline.
 */

import { resolve, join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Command } from "commander";
import chalk from "chalk";
import { getAllModels } from "../core/models.js";

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultVal: string): Promise<string> {
  return new Promise((res) => {
    rl.question(`  ${question} ${chalk.dim(`(${defaultVal})`)} `, (answer) => {
      res(answer.trim() || defaultVal);
    });
  });
}

export const initCommand = new Command("init")
  .description("Create a .ctxlensrc config file")
  .argument("[path]", "directory to create config in", ".")
  .option("--yes", "skip prompts, use defaults")
  .action(async (path: string, opts) => {
    const rootPath = resolve(path);
    const configPath = join(rootPath, ".ctxlensrc");

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`  .ctxlensrc already exists in ${rootPath}`));
      return;
    }

    let model = "claude-sonnet-4-6";
    let depth = "3";
    let top = "10";
    let ignorePatterns = "";

    if (!opts.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      console.log("");
      console.log(chalk.bold("  ctxlens init") + chalk.dim(" — create .ctxlensrc"));
      console.log("");

      const models = getAllModels();
      const modelIds = models.map((m) => m.id).join(", ");
      console.log(chalk.dim(`  Available models: ${modelIds}`));
      console.log("");

      model = await ask(rl, "Default model?", model);
      depth = await ask(rl, "Directory depth?", depth);
      top = await ask(rl, "Top N entries?", top);
      ignorePatterns = await ask(rl, "Extra ignore patterns (comma-separated)?", "");

      rl.close();
    }

    const config: Record<string, unknown> = {
      defaultModel: model,
      depth: parseInt(depth, 10),
      top: parseInt(top, 10),
    };

    if (ignorePatterns) {
      config.ignore = ignorePatterns.split(",").map((s) => s.trim()).filter(Boolean);
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log("");
    console.log(chalk.green(`  ✓ Created ${configPath}`));
    console.log("");
  });
