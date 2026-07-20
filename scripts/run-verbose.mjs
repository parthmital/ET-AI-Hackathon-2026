#!/usr/bin/env node

import { spawn } from "node:child_process";
import { withConciseEnv, withVerboseEnv } from "./verbose-env.mjs";

const [, , ...argv] = process.argv;
const verbose = argv[0] === "--verbose";
const [command, ...args] = verbose ? argv.slice(1) : argv;
const isWindows = process.platform === "win32";

if (!command) {
	console.error("Usage: node scripts/run-verbose.mjs <command> [...args]");
	process.exit(1);
}

const child = isWindows
	? spawn(formatCommand(command, args), {
			env: runtimeEnv(process.env),
			shell: true,
			stdio: "inherit",
		})
	: spawn(command, args, {
			env: runtimeEnv(process.env),
			shell: false,
			stdio: "inherit",
		});

function runtimeEnv(base) {
	return verbose ? withVerboseEnv(base) : withConciseEnv(base);
}

function quoteArg(value) {
	const text = String(value);
	if (!/[\s"]/u.test(text)) return text;
	return `"${text.replaceAll('"', '\\"')}"`;
}

function formatCommand(commandName, commandArgs) {
	return [commandName, ...commandArgs].map(quoteArg).join(" ");
}

child.on("error", (error) => {
	console.error(`[verbose-env] ${command} failed to start: ${error.message}`);
	process.exit(1);
});

child.on("exit", (code, signal) => {
	if (signal) {
		console.error(`[verbose-env] ${command} exited with signal ${signal}`);
		process.exit(1);
	}
	process.exit(code ?? 1);
});
