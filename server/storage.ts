import { users, sessions, type User, type InsertUser, type Session } from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq } from 'drizzle-orm';

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
  createSession(userId: number): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;
  getUserBySessionToken(token: string): Promise<User | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sessions: Map<string, Session>;
  private currentUserId: number;
  private currentSessionId: number;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.currentUserId = 1;
    this.currentSessionId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id, 
      password: hashedPassword,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createSession(userId: number): Promise<Session> {
    const token = crypto.randomBytes(32).toString('hex');
    const id = this.currentSessionId++;
    const session: Session = {
      id,
      userId,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
    };
    this.sessions.set(token, session);
    return session;
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const session = this.sessions.get(token);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    if (session) {
      this.sessions.delete(token);
    }
    return undefined;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async getUserBySessionToken(token: string): Promise<User | undefined> {
    const session = await this.getSessionByToken(token);
    if (session) {
      return this.getUser(session.userId);
    }
    return undefined;
  }
}

export class PostgresStorage implements IStorage {
  private db: any;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    const client = postgres(process.env.DATABASE_URL);
    this.db = drizzle(client);
  }

  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    
    const result = await this.db.insert(users).values({
      email: insertUser.email,
      password: hashedPassword,
      name: insertUser.name,
    }).returning();

    return result[0];
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createSession(userId: number): Promise<Session> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const result = await this.db.insert(sessions).values({
      userId,
      token,
      expiresAt,
    }).returning();

    return result[0];
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
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

  async deleteSession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.token, token));
  }

  async getUserBySessionToken(token: string): Promise<User | undefined> {
    const session = await this.getSessionByToken(token);
    if (session) {
      return this.getUser(session.userId);
    }
    return undefined;
  }
}

// Use PostgreSQL storage if DATABASE_URL is provided, otherwise use MemStorage
export const storage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();
