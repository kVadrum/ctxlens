/**
 * ctxlens CLI entry point.
 *
 * Registers all commands (scan, models) with Commander.js and parses argv.
 * This file is the `bin` target — it runs when a user invokes `ctxlens` or
 * `npx ctxlens`.
 */

import { Command } from "commander";
import { scanCommand } from "./scan.js";
import { modelsCommand } from "./models.js";
import { budgetCommand } from "./budget.js";
import { optimizeCommand } from "./optimize.js";
import { watchCommand } from "./watch.js";
import { diffCommand } from "./diff.js";
import { VERSION } from "../utils/version.js";

const program = new Command()
  .name("ctxlens")
  .description("Token budget analyzer for AI context windows")
  .version(VERSION);

program.addCommand(scanCommand);
program.addCommand(budgetCommand);
program.addCommand(optimizeCommand);
program.addCommand(watchCommand);
program.addCommand(diffCommand);
program.addCommand(modelsCommand);

program.parse();
