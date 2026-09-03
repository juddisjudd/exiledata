#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program.name("exiledata").description("ExileData developer/data operations CLI").version("0.0.0");

function stub(commandName: string) {
  return () => {
    console.log(`"${commandName}" is not implemented yet.`);
    process.exitCode = 1;
  };
}

program
  .command("ingest")
  .description("Run ingestion for a game/source (not implemented)")
  .action(stub("ingest"));

program
  .command("validate")
  .description("Validate normalized entities against the canonical schema (not implemented)")
  .action(stub("validate"));

program
  .command("build")
  .description("Build a dataset from validated entities (not implemented)")
  .action(stub("build"));

program
  .command("diff")
  .description("Compare two dataset versions (not implemented)")
  .action(stub("diff"));

program
  .command("version")
  .description("Show dataset/schema version information (not implemented)")
  .action(stub("version"));

program
  .command("inspect")
  .description("Inspect a dataset or entity (not implemented)")
  .action(stub("inspect"));

program.parse();
