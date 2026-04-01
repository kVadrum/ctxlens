import { Command } from "commander";
import chalk from "chalk";
import { getAllModels } from "../core/models.js";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

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
