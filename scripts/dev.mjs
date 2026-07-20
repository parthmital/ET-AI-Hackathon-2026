#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	conciseEnv,
	verboseEnv,
	withConciseEnv,
	withVerboseEnv,
} from "./verbose-env.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const backendDir = join(repoRoot, "backend");
const frontendDir = join(repoRoot, "frontend");
const venvDir = join(backendDir, ".venv");
const isWindows = process.platform === "win32";
const venvPython = isWindows
	? join(venvDir, "Scripts", "python.exe")
	: join(venvDir, "bin", "python");
const frontendNodeModules = join(frontendDir, "node_modules");
const backendRequirements = join(backendDir, "requirements.txt");
const npmCommand = isWindows ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const setupOnly = process.argv.includes("--setup-only");
const verboseLogging =
	process.argv.includes("--verbose") || process.env.DEV_VERBOSE === "1";
const inlineLogs =
	process.argv.includes("--inline") || process.env.DEV_INLINE === "1";
const forceSeparateWindows = process.argv.includes("--separate-windows");
const useSeparateWindows =
	(forceSeparateWindows || isWindows) && isWindows && !inlineLogs;
const children = new Set();
let shuttingDown = false;

function log(message) {
	console.log(`[dev] ${message}`);
}

function quoteArg(value) {
	return /\s/.test(value) ? `"${value}"` : value;
}

function formatCommand(command, args) {
	return [command, ...args].map(quoteArg).join(" ");
}

function powershellLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function encodePowerShellCommand(script) {
	return Buffer.from(script, "utf16le").toString("base64");
}

function run(command, args, options = {}) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? repoRoot,
			env: withRuntimeEnv(process.env, options.env ?? {}),
			shell: options.shell ?? false,
			stdio: "inherit",
		});

		child.on("error", rejectRun);
		child.on("exit", (code, signal) => {
			if (code === 0) {
				resolveRun();
				return;
			}
			rejectRun(
				new Error(
					`${formatCommand(command, args)} exited with ${code ?? signal}`,
				),
			);
		});
	});
}

function withRuntimeEnv(base = process.env, overrides = {}) {
	return verboseLogging
		? withVerboseEnv(base, overrides)
		: withConciseEnv(base, overrides);
}

function npmInvocation(args) {
	if (npmExecPath && npmExecPath.endsWith(".js")) {
		return {
			command: process.execPath,
			args: [npmExecPath, ...args],
			shell: false,
		};
	}
	return {
		command: npmCommand,
		args,
		shell: isWindows,
	};
}

function assertPortAvailable(port, serviceName) {
	return new Promise((resolveCheck, rejectCheck) => {
		const server = createServer();
		server.once("error", (error) => {
			if (error.code === "EADDRINUSE") {
				rejectCheck(
					new Error(
						`${serviceName} port ${port} is already in use. Stop the existing process and run npm run dev again.`,
					),
				);
				return;
			}
			rejectCheck(error);
		});
		server.once("listening", () => {
			server.close(resolveCheck);
		});
		server.listen(port);
	});
}

function commandVersion(candidate) {
	const result = spawnSync(
		candidate.command,
		[...candidate.args, "--version"],
		{
			cwd: repoRoot,
			encoding: "utf8",
			shell: false,
			stdio: "pipe",
		},
	);
	if (result.status !== 0) {
		return null;
	}
	return `${result.stdout}${result.stderr}`.trim();
}

async function createBackendVenv() {
	const candidates = isWindows
		? [
				{ command: "py", args: ["-3.11"], label: "py -3.11" },
				{ command: "python3.11", args: [], label: "python3.11" },
				{ command: "python", args: [], label: "python" },
			]
		: [
				{ command: "python3.11", args: [], label: "python3.11" },
				{ command: "python3", args: [], label: "python3" },
				{ command: "python", args: [], label: "python" },
			];

	let lastError = null;
	for (const candidate of candidates) {
		const version = commandVersion(candidate);
		if (!version) {
			continue;
		}
		log(`Creating backend .venv with ${candidate.label} (${version}).`);
		try {
			await run(candidate.command, [...candidate.args, "-m", "venv", venvDir], {
				cwd: backendDir,
			});
			if (existsSync(venvPython)) {
				return;
			}
			lastError = new Error(`Created venv but did not find ${venvPython}`);
		} catch (error) {
			lastError = error;
		}
	}

	const detail =
		lastError instanceof Error && lastError.message
			? ` Last error: ${lastError.message}`
			: "";
	throw new Error(
		`Could not create backend .venv. Install Python 3.11 or ensure python is on PATH.${detail}`,
	);
}

async function setupBackend() {
	if (!existsSync(backendRequirements)) {
		throw new Error(
			`Missing backend requirements file: ${backendRequirements}`,
		);
	}

	if (!existsSync(venvPython)) {
		await createBackendVenv();
	} else {
		log(`Using backend venv Python at ${venvPython}`);
	}

	log("Installing backend dependencies into backend/.venv.");
	const pipArgs = ["-m", "pip", "install"];
	if (verboseLogging) {
		pipArgs.push("-vvv");
	}
	await run(venvPython, [...pipArgs, "-r", backendRequirements], {
		cwd: backendDir,
	});
}

async function setupFrontend() {
	if (existsSync(frontendNodeModules)) {
		log("Using existing frontend/node_modules.");
		return;
	}

	log("Installing frontend dependencies.");
	const npm = npmInvocation([
		...(verboseLogging ? ["--loglevel", "silly"] : []),
		"install",
		"--prefix",
		frontendDir,
	]);
	await run(npm.command, npm.args, {
		cwd: repoRoot,
		shell: npm.shell,
	});
}

function pipeWithPrefix(stream, prefix) {
	let buffer = "";
	stream.setEncoding("utf8");
	stream.on("data", (chunk) => {
		buffer += chunk;
		const lines = buffer.split(/\r?\n/);
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (line.length === 0) {
				console.log("");
			} else {
				console.log(`[${prefix}] ${line}`);
			}
		}
	});
	stream.on("end", () => {
		if (buffer.length > 0) {
			console.log(`[${prefix}] ${buffer}`);
		}
	});
}

function buildPowerShellServiceScript(name, command, args, options = {}) {
	const cwd = options.cwd ?? repoRoot;
	const env = withRuntimeEnv({}, options.env ?? {});
	const envLines = Object.entries(env).map(
		([key, value]) =>
			`[Environment]::SetEnvironmentVariable(${powershellLiteral(key)}, ${powershellLiteral(value)}, 'Process')`,
	);
	const invocation = [
		"&",
		powershellLiteral(command),
		...args.map(powershellLiteral),
	].join(" ");
	const commandDisplay = formatCommand(command, args);

	return [
		"$ErrorActionPreference = 'Continue'",
		`$Host.UI.RawUI.WindowTitle = ${powershellLiteral(`Industrial Ops Brain ${name}`)}`,
		`Set-Location -LiteralPath ${powershellLiteral(cwd)}`,
		...envLines,
		`Write-Host ${powershellLiteral(`[dev:${name}] ${commandDisplay}`)}`,
		`Write-Host ${powershellLiteral(`[dev:${name}] cwd: ${cwd}`)}`,
		"Write-Host ''",
		"$serviceExitCode = 0",
		"try {",
		`  ${invocation}`,
		"  if ($null -ne $global:LASTEXITCODE) { $serviceExitCode = $global:LASTEXITCODE }",
		"} catch {",
		"  Write-Error $_",
		"  $serviceExitCode = 1",
		"}",
		"Write-Host ''",
		`Write-Host (${powershellLiteral(`[dev:${name}] process exited with code `)} + $serviceExitCode)`,
		`Read-Host ${powershellLiteral("Press Enter to close this window")}`,
		"exit $serviceExitCode",
	].join("\n");
}

function launchPowerShellWindow(name, command, args, options = {}) {
	return new Promise((resolveLaunch, rejectLaunch) => {
		const cwd = options.cwd ?? repoRoot;
		const encodedServiceScript = encodePowerShellCommand(
			buildPowerShellServiceScript(name, command, args, options),
		);
		const launcherScript = [
			"$ErrorActionPreference = 'Stop'",
			"$arguments = @(",
			[
				"-NoProfile",
				"-ExecutionPolicy",
				"Bypass",
				"-EncodedCommand",
				encodedServiceScript,
			]
				.map((argument) => `  ${powershellLiteral(argument)}`)
				.join(",\n"),
			")",
			`$process = Start-Process -FilePath ${powershellLiteral("powershell.exe")} -ArgumentList $arguments -WorkingDirectory ${powershellLiteral(cwd)} -PassThru`,
			"$process.Id",
		].join("\n");
		const launcher = spawn(
			"powershell.exe",
			[
				"-NoProfile",
				"-ExecutionPolicy",
				"Bypass",
				"-EncodedCommand",
				encodePowerShellCommand(launcherScript),
			],
			{
				cwd: repoRoot,
				env: withRuntimeEnv(process.env),
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			},
		);

		let stdout = "";
		let stderr = "";
		launcher.stdout.setEncoding("utf8");
		launcher.stderr.setEncoding("utf8");
		launcher.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		launcher.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		launcher.on("error", rejectLaunch);
		launcher.on("exit", (code, signal) => {
			if (code !== 0) {
				rejectLaunch(
					new Error(
						`Could not open ${name} PowerShell window: ${stderr.trim() || signal || `exit code ${code}`}`,
					),
				);
				return;
			}

			const pid = Number(stdout.trim().split(/\s+/).pop());
			if (!Number.isInteger(pid) || pid <= 0) {
				rejectLaunch(
					new Error(
						`Could not read ${name} PowerShell window pid from: ${stdout.trim()}`,
					),
				);
				return;
			}
			resolveLaunch(pid);
		});
	});
}

function isProcessRunning(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error && error.code === "EPERM";
	}
}

function watchWindowService(service) {
	service.monitor = setInterval(() => {
		if (shuttingDown || isProcessRunning(service.pid)) {
			return;
		}

		clearInterval(service.monitor);
		children.delete(service);
		console.error(`[dev] ${service.name} PowerShell window closed.`);
		stopAll(1);
	}, 2000);
}

async function startPowerShellWindowService(name, command, args, options = {}) {
	const pid = await launchPowerShellWindow(name, command, args, options);
	const service = { name, pid, child: null, monitor: null };
	children.add(service);
	watchWindowService(service);
	log(`${name} logs are streaming in PowerShell window pid ${pid}.`);
	return service;
}

function startService(name, command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: options.cwd ?? repoRoot,
		env: withRuntimeEnv(process.env, options.env ?? {}),
		detached: !isWindows,
		shell: options.shell ?? false,
		stdio: ["ignore", "pipe", "pipe"],
	});

	const service = { name, pid: child.pid, child, monitor: null };
	children.add(service);
	pipeWithPrefix(child.stdout, name);
	pipeWithPrefix(child.stderr, name);

	child.on("error", (error) => {
		if (shuttingDown) {
			return;
		}
		console.error(`[dev] ${name} failed to start: ${error.message}`);
		stopAll(1);
	});

	child.on("exit", (code, signal) => {
		children.delete(service);
		if (shuttingDown) {
			return;
		}
		console.error(
			`[dev] ${name} stopped with ${code === null ? signal : `exit code ${code}`}.`,
		);
		stopAll(code === 0 || code === null ? 1 : code);
	});

	return child;
}

function stopProcessTree(service) {
	return new Promise((resolveStop) => {
		if (service.monitor) {
			clearInterval(service.monitor);
		}

		const child = service.child;
		const pid = service.pid ?? child?.pid;
		if (!pid || (child && child.exitCode !== null)) {
			resolveStop();
			return;
		}

		if (isWindows) {
			const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
				stdio: "ignore",
			});
			killer.on("exit", () => resolveStop());
			killer.on("error", () => resolveStop());
			return;
		}

		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {
			resolveStop();
			return;
		}

		const timer = setTimeout(() => {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// Process already exited.
			}
			resolveStop();
		}, 5000);

		child.on("exit", () => {
			clearTimeout(timer);
			resolveStop();
		});
	});
}

function stopAll(exitCode) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	const stops = [...children].map(stopProcessTree);
	Promise.allSettled(stops).then(() => process.exit(exitCode));
}

async function setup() {
	await setupBackend();
	await setupFrontend();
}

async function main() {
	await setup();
	if (setupOnly) {
		log("Setup complete.");
		return;
	}

	await assertPortAvailable(8000, "Backend");
	await assertPortAvailable(3000, "Frontend");

	if (forceSeparateWindows && !isWindows) {
		log(
			"Separate PowerShell windows are only supported on Windows. Using inline logs.",
		);
	}

	log(
		useSeparateWindows
			? "Starting backend and frontend in separate PowerShell windows."
			: "Starting backend and frontend.",
	);
	log(
		verboseLogging
			? `Verbose terminal logging is enabled with ${JSON.stringify(verboseEnv({}))}.`
			: `Concise terminal logging is enabled with ${JSON.stringify(conciseEnv({}))}.`,
	);
	log("Frontend: http://localhost:3000");
	log("Backend health: http://127.0.0.1:8000/health");
	log("Backend API docs: http://127.0.0.1:8000/docs");

	const backendService = {
		name: "backend",
		command: venvPython,
		args: [
			"-m",
			"uvicorn",
			"app.main:app",
			"--reload",
			"--host",
			"127.0.0.1",
			"--port",
			"8000",
			"--log-level",
			verboseLogging ? "trace" : "info",
			...(verboseLogging ? ["--access-log"] : []),
		],
		options: {
			cwd: backendDir,
			env: {
				LOG_LEVEL: verboseLogging ? "TRACE" : "INFO",
				SQLALCHEMY_ECHO: verboseLogging ? "debug" : "false",
				SQLALCHEMY_ECHO_POOL: verboseLogging ? "debug" : "false",
				SQLALCHEMY_LOG_LEVEL: verboseLogging ? "TRACE" : "WARNING",
				TERMINAL_LOG_LEVEL: verboseLogging ? "TRACE" : "INFO",
				UVICORN_LOG_LEVEL: verboseLogging ? "trace" : "info",
			},
		},
	};
	const npm = npmInvocation([
		...(verboseLogging ? ["--loglevel", "silly"] : []),
		"run",
		verboseLogging ? "dev:verbose" : "dev",
	]);
	const frontendService = {
		name: "frontend",
		command: npm.command,
		args: npm.args,
		options: {
			cwd: frontendDir,
			env: {
				NEXT_PUBLIC_TERMINAL_BROWSER_LOGS: "1",
				NEXT_PUBLIC_TERMINAL_LOG_LEVEL: verboseLogging ? "trace" : "info",
			},
			shell: npm.shell,
		},
	};
	const services = [backendService, frontendService];

	if (useSeparateWindows) {
		for (const service of services) {
			await startPowerShellWindowService(
				service.name,
				service.command,
				service.args,
				service.options,
			);
		}
		log("Press Ctrl+C here to stop both service windows.");
		return;
	}

	for (const service of services) {
		startService(service.name, service.command, service.args, service.options);
	}
}

process.on("SIGINT", () => {
	log("Stopping services.");
	stopAll(0);
});
process.on("SIGTERM", () => {
	log("Stopping services.");
	stopAll(0);
});

main().catch((error) => {
	console.error(`[dev] ${error instanceof Error ? error.message : error}`);
	stopAll(1);
});
