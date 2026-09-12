#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * The bot is a short-lived process, not a service: one invocation handles one
 * meeting, then exits with a code describing what happened. That boundary is
 * what lets a scheduler later spawn bots as ephemeral containers without the
 * bot needing to know anything about calendars, queues or databases.
 */
import { ConfigError, USAGE, parseCommand } from './config.js';
import { runDoctor } from './doctor.js';
import { runJoin } from './session.js';
import { runWatch } from './watch.js';
import { ExitCode } from './types.js';

async function main(): Promise<number> {
  let command;
  try {
    command = parseCommand(process.argv.slice(2));
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`error: ${err.message}\n\n${USAGE}`);
      return ExitCode.FAILURE;
    }
    throw err;
  }

  switch (command.kind) {
    case 'help':
      process.stdout.write(USAGE);
      return ExitCode.OK;
    case 'doctor':
      return runDoctor(command.options);
    case 'join':
      return runJoin(command.options);
    case 'watch':
      return runWatch(command.options);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    if ((err as Error).stack) {
      process.stderr.write(`${(err as Error).stack}\n`);
    }
    process.exitCode = ExitCode.FAILURE;
  });
