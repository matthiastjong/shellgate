import { Client } from "ssh2";
import type { SshConfig } from "../db/schema";

const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB

export interface SshExecResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

export async function executeCommand(
	config: SshConfig,
	privateKey: string,
	command: string,
	timeoutMs?: number,
): Promise<SshExecResult> {
	const timeout = Math.min(timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

	if (!command || !command.trim()) {
		throw new Error("command is required");
	}

	return new Promise((resolve, reject) => {
		const start = Date.now();
		const conn = new Client();
		let settled = false;

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				conn.end();
				reject(new Error(`command timed out after ${timeout}ms`));
			}
		}, timeout);

		conn.on("ready", () => {
			conn.exec(command, (err, stream) => {
				if (err) {
					settled = true;
					clearTimeout(timer);
					conn.end();
					reject(err);
					return;
				}

				const stdoutChunks: Buffer[] = [];
				const stderrChunks: Buffer[] = [];
				let stdoutLen = 0;
				let stderrLen = 0;

				stream.on("data", (data: Buffer) => {
					if (stdoutLen < MAX_OUTPUT_BYTES) {
						stdoutChunks.push(data);
						stdoutLen += data.length;
					}
				});

				stream.stderr.on("data", (data: Buffer) => {
					if (stderrLen < MAX_OUTPUT_BYTES) {
						stderrChunks.push(data);
						stderrLen += data.length;
					}
				});

				stream.on("close", (code: number) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					conn.end();

					resolve({
						exitCode: code ?? 0,
						stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
						stderr: Buffer.concat(stderrChunks).toString("utf-8"),
						durationMs: Date.now() - start,
					});
				});
			});
		});

		conn.on("error", (err) => {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				reject(err);
			}
		});

		conn.connect({
			host: config.host,
			port: config.port,
			username: config.username,
			privateKey,
		});
	});
}
