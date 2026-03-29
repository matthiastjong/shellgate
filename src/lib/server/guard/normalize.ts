export type TargetType = "ssh" | "api";

export interface NormalizedRequest {
	type: TargetType;
	method?: string;
	path?: string;
	command?: string;
}

export function normalizeApiRequest(method: string, path: string): NormalizedRequest {
	return {
		type: "api",
		method: method.toUpperCase(),
		path: path.startsWith("/") ? path : `/${path}`,
	};
}

export function normalizeSshRequest(command: string): NormalizedRequest {
	return {
		type: "ssh",
		command,
	};
}
