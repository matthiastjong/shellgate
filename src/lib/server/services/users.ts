import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, count } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "../db/schema";

function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(password, salt, 64).toString("hex");
	return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(":");
	const derived = scryptSync(password, salt, 64);
	return timingSafeEqual(Buffer.from(hash, "hex"), derived);
}

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ value: count() }).from(users);
	return row.value;
}

export async function createUser(email: string, password: string): Promise<User> {
	const trimmed = email.trim().toLowerCase();
	if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		throw new Error("Invalid email address");
	}
	if (password.length < 8) {
		throw new Error("Password must be at least 8 characters");
	}
	const passwordHash = hashPassword(password);
	const [user] = await db.insert(users).values({ email: trimmed, passwordHash }).returning();
	return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()));
	return user ?? null;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
	const [user] = await db
		.select()
		.from(users)
		.where(eq(users.email, email.trim().toLowerCase()));
	if (!user) return null;
	if (!verifyPassword(password, user.passwordHash)) return null;
	return user;
}
