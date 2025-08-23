import { users, sessions } from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq } from 'drizzle-orm';
export class MemStorage {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.currentUserId = 1;
        this.currentSessionId = 1;
    }
    async getUser(id) {
        return this.users.get(id);
    }
    async getUserByEmail(email) {
        return Array.from(this.users.values()).find((user) => user.email === email);
    }
    async createUser(insertUser) {
        const hashedPassword = await bcrypt.hash(insertUser.password, 10);
        const id = this.currentUserId++;
        const user = {
            ...insertUser,
            id,
            password: hashedPassword,
            createdAt: new Date(),
        };
        this.users.set(id, user);
        return user;
    }
    async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
    async createSession(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const id = this.currentSessionId++;
        const session = {
            id,
            userId,
            token,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            createdAt: new Date(),
        };
        this.sessions.set(token, session);
        return session;
    }
    async getSessionByToken(token) {
        const session = this.sessions.get(token);
        if (session && session.expiresAt > new Date()) {
            return session;
        }
        if (session) {
            this.sessions.delete(token);
        }
        return undefined;
    }
    async deleteSession(token) {
        this.sessions.delete(token);
    }
    async getUserBySessionToken(token) {
        const session = await this.getSessionByToken(token);
        if (session) {
            return this.getUser(session.userId);
        }
        return undefined;
    }
}
export class PostgresStorage {
    constructor() {
        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL environment variable is required");
        }
        const client = postgres(process.env.DATABASE_URL);
        this.db = drizzle(client);
    }
    async getUser(id) {
        const result = await this.db.select().from(users).where(eq(users.id, id));
        return result[0];
    }
    async getUserByEmail(email) {
        const result = await this.db.select().from(users).where(eq(users.email, email));
        return result[0];
    }
    async createUser(insertUser) {
        const hashedPassword = await bcrypt.hash(insertUser.password, 10);
        const result = await this.db.insert(users).values({
            email: insertUser.email,
            password: hashedPassword,
            name: insertUser.name,
        }).returning();
        return result[0];
    }
    async verifyPassword(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
    async createSession(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        const result = await this.db.insert(sessions).values({
            userId,
            token,
            expiresAt,
        }).returning();
        return result[0];
    }
    async getSessionByToken(token) {
        const result = await this.db.select().from(sessions).where(eq(sessions.token, token));
        const session = result[0];
        if (session && session.expiresAt > new Date()) {
            return session;
        }
        if (session) {
            await this.deleteSession(token);
        }
        return undefined;
    }
    async deleteSession(token) {
        await this.db.delete(sessions).where(eq(sessions.token, token));
    }
    async getUserBySessionToken(token) {
        const session = await this.getSessionByToken(token);
        if (session) {
            return this.getUser(session.userId);
        }
        return undefined;
    }
}
// Use PostgreSQL storage if DATABASE_URL is provided, otherwise use MemStorage
export const storage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();
