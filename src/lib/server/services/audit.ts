import { db } from "../db";
import { auditLogs } from "../db/schema";

type AuditLogData = {
	tokenId: string | null;
	tokenName: string | null;
	targetId: string | null;
	targetSlug: string | null;
	type: "gateway" | "ssh";
	method: string | null;
	path: string | null;
	statusCode: number | null;
	clientIp: string;
	durationMs: number | null;
};

export function logRequest(data: AuditLogData): void {
	db.insert(auditLogs).values(data).execute().catch(() => {});
}
