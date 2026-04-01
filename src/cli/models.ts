/**
 * `ctxlens models` command.
 *
 * Lists all supported AI models from the registry with their context window
 * sizes and tokenizer assignments. Models using an approximate (non-native)
 * tokenizer are marked with ≈.
 */

import { Command } from "commander";
import chalk from "chalk";
import { getAllModels } from "../core/models.js";
import { formatTokens } from "../utils/format.js";

export const modelsCommand = new Command("models")
  .description("List supported models with context window sizes")
  .action(() => {
    const models = getAllModels();

    console.log("");
    console.log(
      chalk.bold("  Model".padEnd(28)) +
        chalk.bold("Context Window".padEnd(18)) +
        chalk.bold("Tokenizer"),
    );
    console.log(chalk.dim("  " + "─".repeat(60)));

    for (const model of models) {
      const name = `  ${model.id}`.padEnd(28);
      const window = `${formatTokens(model.contextWindow)} tk`.padEnd(18);
      const tokenizer = model.tokenizerNote
        ? `${model.tokenizer} ${chalk.dim("≈")}`
        : model.tokenizer;
      console.log(`${name}${window}${tokenizer}`);
    }
    console.log("");
  });
