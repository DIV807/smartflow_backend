import { createServer } from "http";
import { storage } from "./storage";
import { loginSchema, signupSchema } from "@shared/schema";
export async function registerRoutes(app) {
    // Auth routes
    app.post("/api/auth/login", async (req, res) => {
        try {
            const { email, password } = loginSchema.parse(req.body);
            const user = await storage.getUserByEmail(email);
            if (!user) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            const isValidPassword = await storage.verifyPassword(password, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ message: "Invalid email or password" });
            }
            const session = await storage.createSession(user.id);
            res.cookie('session', session.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                }
            });
        }
        catch (error) {
            console.error('Login error:', error);
            res.status(400).json({ message: "Invalid request data" });
        }
    });
    app.post("/api/auth/signup", async (req, res) => {
        try {
            const data = signupSchema.parse(req.body);
            const existingUser = await storage.getUserByEmail(data.email);
            if (existingUser) {
                return res.status(409).json({ message: "User with this email already exists" });
            }
            const user = await storage.createUser({
                email: data.email,
                password: data.password,
                name: data.name,
            });
            const session = await storage.createSession(user.id);
            res.cookie('session', session.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.status(201).json({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                }
            });
        }
        catch (error) {
            console.error('Signup error:', error);
            res.status(400).json({ message: "Invalid request data" });
        }
    });
    app.post("/api/auth/logout", async (req, res) => {
        const sessionToken = req.cookies.session;
        if (sessionToken) {
            await storage.deleteSession(sessionToken);
        }
        res.clearCookie('session');
        res.json({ message: "Logged out successfully" });
    });
    app.get("/api/auth/me", async (req, res) => {
        const sessionToken = req.cookies.session;
        if (!sessionToken) {
            return res.status(401).json({ message: "Not authenticated" });
        }
        const user = await storage.getUserBySessionToken(sessionToken);
        if (!user) {
            return res.status(401).json({ message: "Invalid session" });
        }
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            }
        });
    });
    const httpServer = createServer(app);
    return httpServer;
}
