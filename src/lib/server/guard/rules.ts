import type { TargetType } from "./normalize";

export type RuleAction = "allow" | "block" | "approval_required";
export type RuleField = "command" | "method" | "path" | "query";
export type RuleOperator = "contains" | "equals" | "starts_with";

export interface Rule {
	field: RuleField;
	operator: RuleOperator;
	value: string;
	action: RuleAction;
	reason: string;
}

function sshApprovalRule(value: string): Rule {
	return {
		field: "command",
		operator: "contains",
		value,
		action: "approval_required",
		reason: `Command contains "${value}"`,
	};
}

function sshBlockRule(value: string): Rule {
	return {
		field: "command",
		operator: "contains",
		value,
		action: "block",
		reason: `Command contains "${value}" — blocked for safety`,
	};
}

export const BUILTIN_SSH_RULES: Rule[] = [
	// Block rules first (higher priority)
	sshBlockRule("/etc/shadow"),
	sshBlockRule("/etc/sudoers"),
	sshBlockRule("curl | bash"),
	sshBlockRule("wget | sh"),

	// Approval-required rules
	sshApprovalRule("rm -r"),
	sshApprovalRule("rm -f"),
	sshApprovalRule("rmdir"),
	sshApprovalRule("shred"),
	sshApprovalRule("dd if="),
	sshApprovalRule("mkfs"),
	sshApprovalRule("fdisk"),
	sshApprovalRule("parted"),
	sshApprovalRule("shutdown"),
	sshApprovalRule("reboot"),
	sshApprovalRule("halt"),
	sshApprovalRule("poweroff"),
	sshApprovalRule("systemctl stop"),
	sshApprovalRule("systemctl disable"),
	sshApprovalRule("systemctl mask"),
	sshApprovalRule("service stop"),
	sshApprovalRule("kill -9"),
	sshApprovalRule("killall"),
	sshApprovalRule("pkill"),
	sshApprovalRule("passwd"),
	sshApprovalRule("chpasswd"),
	sshApprovalRule("usermod"),
	sshApprovalRule("userdel"),
	sshApprovalRule("groupdel"),
	sshApprovalRule("chmod 777"),
	sshApprovalRule("chown root"),
	sshApprovalRule("iptables -F"),
	sshApprovalRule("ufw disable"),
];

function apiApprovalMethodRule(value: string): Rule {
	return {
		field: "method",
		operator: "equals",
		value,
		action: "approval_required",
		reason: `HTTP method ${value} requires approval`,
	};
}

function apiApprovalPathRule(value: string): Rule {
	return {
		field: "path",
		operator: "contains",
		value,
		action: "approval_required",
		reason: `Path contains "${value}"`,
	};
}

export const BUILTIN_API_RULES: Rule[] = [
	apiApprovalMethodRule("DELETE"),
	apiApprovalPathRule("/delete"),
	apiApprovalPathRule("/remove"),
	apiApprovalPathRule("/destroy"),
	apiApprovalPathRule("/drop"),
	apiApprovalPathRule("/purge"),
	apiApprovalPathRule("/reset"),
	apiApprovalPathRule("/wipe"),
	apiApprovalPathRule("/deploy"),
	apiApprovalPathRule("/restart"),
	apiApprovalPathRule("/stop"),
	apiApprovalPathRule("/shutdown"),
	apiApprovalPathRule("/rollback"),
];

export function getBuiltinRules(type: TargetType): Rule[] {
	return type === "ssh" ? BUILTIN_SSH_RULES : BUILTIN_API_RULES;
}
