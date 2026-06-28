#!/usr/bin/env node
import fs from "node:fs";
import { navigateCase, writeOutbox } from "./resource-navigator.js";

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function parseArgs(argv) {
  const args = { outbox: null, inputPath: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--outbox") {
      args.outbox = argv[i + 1];
      i += 1;
    } else {
      args.inputPath = argv[i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const raw = args.inputPath ? fs.readFileSync(args.inputPath, "utf8") : readStdin();
const inputCase = JSON.parse(raw);
const plan = navigateCase(inputCase);
if (args.outbox) writeOutbox(plan, args.outbox);
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
