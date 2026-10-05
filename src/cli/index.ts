#!/usr/bin/env node
// `snap-pair` bin entry (built to dist/cli/index.js). Logic lives in ./main.ts so tests can drive it.
import { main } from './main';

main(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  env: process.env,
}).then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
