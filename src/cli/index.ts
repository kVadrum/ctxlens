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

const program = new Command()
  .name("ctxlens")
  .description("Token budget analyzer for AI context windows")
  .version("0.1.0");

program.addCommand(scanCommand);
program.addCommand(modelsCommand);

program.parse();
