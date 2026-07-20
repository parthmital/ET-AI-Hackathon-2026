const VERBOSE_NODE_OPTIONS = [
	"--enable-source-maps",
	"--trace-deprecation",
	"--trace-uncaught",
	"--trace-warnings",
];

const VERBOSE_NODE_DEBUG_MODULES = [
	"child_process",
	"cluster",
	"dns",
	"fs",
	"http",
	"https",
	"module",
	"net",
	"stream",
	"timers",
	"tls",
];

function appendUniqueWords(existing, additions) {
	const values = new Set(
		String(existing ?? "")
			.split(/\s+/)
			.filter(Boolean),
	);
	for (const value of additions) {
		values.add(value);
	}
	return [...values].join(" ");
}

function appendUniqueCsv(existing, additions) {
	const values = new Set(
		String(existing ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean),
	);
	for (const value of additions) {
		values.add(value);
	}
	return [...values].join(",");
}

export function verboseEnv(base = process.env) {
	return {
		DEBUG: "*",
		FORCE_COLOR: "1",
		LOG_COLOR: "1",
		LOG_LEVEL: "TRACE",
		NEXT_PUBLIC_TERMINAL_BROWSER_LOGS: "1",
		NEXT_TELEMETRY_DEBUG: "1",
		NODE_DEBUG: appendUniqueCsv(base.NODE_DEBUG, VERBOSE_NODE_DEBUG_MODULES),
		NODE_OPTIONS: appendUniqueWords(base.NODE_OPTIONS, VERBOSE_NODE_OPTIONS),
		NPM_CONFIG_COLOR: "always",
		NPM_CONFIG_FOREGROUND_SCRIPTS: "true",
		NPM_CONFIG_LOGLEVEL: "silly",
		NPM_CONFIG_PROGRESS: "true",
		PIP_PROGRESS_BAR: "on",
		PIP_VERBOSE: "3",
		PYTHONASYNCIODEBUG: "1",
		PYTHONDEVMODE: "1",
		PYTHONFAULTHANDLER: "1",
		PYTHONUNBUFFERED: "1",
		PYTHONWARNINGS: "always",
		RUST_BACKTRACE: "full",
		RUST_LOG: "trace",
		SQLALCHEMY_ECHO: "debug",
		SQLALCHEMY_ECHO_POOL: "debug",
		SQLALCHEMY_LOG_LEVEL: "TRACE",
		TERMINAL_LOG_LEVEL: "TRACE",
		TERM: base.TERM ?? "xterm-256color",
		TURBOPACK_LOG_LEVEL: "trace",
		UVICORN_LOG_LEVEL: "trace",
		WATCHFILES_DEBUG: "1",
		WATCHPACK_LOG_LEVEL: "debug",
	};
}

export function conciseEnv(base = process.env) {
	return {
		FORCE_COLOR: base.FORCE_COLOR ?? "1",
		LOG_COLOR: base.LOG_COLOR ?? "1",
		LOG_LEVEL: base.LOG_LEVEL ?? "INFO",
		NEXT_PUBLIC_TERMINAL_BROWSER_LOGS:
			base.NEXT_PUBLIC_TERMINAL_BROWSER_LOGS ?? "1",
		NEXT_PUBLIC_TERMINAL_LOG_LEVEL:
			base.NEXT_PUBLIC_TERMINAL_LOG_LEVEL ?? "info",
		NPM_CONFIG_COLOR: base.NPM_CONFIG_COLOR ?? "always",
		NPM_CONFIG_FOREGROUND_SCRIPTS:
			base.NPM_CONFIG_FOREGROUND_SCRIPTS ?? "false",
		NPM_CONFIG_LOGLEVEL: base.NPM_CONFIG_LOGLEVEL ?? "notice",
		NPM_CONFIG_PROGRESS: base.NPM_CONFIG_PROGRESS ?? "false",
		PIP_PROGRESS_BAR: base.PIP_PROGRESS_BAR ?? "off",
		PYTHONFAULTHANDLER: base.PYTHONFAULTHANDLER ?? "1",
		PYTHONUNBUFFERED: base.PYTHONUNBUFFERED ?? "1",
		SQLALCHEMY_ECHO: base.SQLALCHEMY_ECHO ?? "false",
		SQLALCHEMY_ECHO_POOL: base.SQLALCHEMY_ECHO_POOL ?? "false",
		SQLALCHEMY_LOG_LEVEL: base.SQLALCHEMY_LOG_LEVEL ?? "WARNING",
		TERMINAL_LOG_LEVEL: base.TERMINAL_LOG_LEVEL ?? "INFO",
		TERM: base.TERM ?? "xterm-256color",
		UVICORN_LOG_LEVEL: base.UVICORN_LOG_LEVEL ?? "info",
	};
}

export function withConciseEnv(base = process.env, overrides = {}) {
	return {
		...base,
		...conciseEnv(base),
		...overrides,
	};
}

export function withVerboseEnv(base = process.env, overrides = {}) {
	const merged = {
		...base,
		...verboseEnv(base),
		...overrides,
	};
	merged.NODE_OPTIONS = appendUniqueWords(base.NODE_OPTIONS, [
		...VERBOSE_NODE_OPTIONS,
		...String(overrides.NODE_OPTIONS ?? "")
			.split(/\s+/)
			.filter(Boolean),
	]);
	merged.NODE_DEBUG = appendUniqueCsv(base.NODE_DEBUG, [
		...VERBOSE_NODE_DEBUG_MODULES,
		...String(overrides.NODE_DEBUG ?? "")
			.split(",")
			.filter(Boolean),
	]);
	return merged;
}

export function installVerboseEnv() {
	const env = withVerboseEnv(process.env);
	Object.assign(process.env, env);
	return env;
}
