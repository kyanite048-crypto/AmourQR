import NextAuth, { type NextAuthOptions } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

/**
 * Get the base URL for NextAuth at runtime.
 * For Netlify: uses NEXTAUTH_URL env var, or falls back to URL context if available.
 * This ensures OAuth callbacks work correctly in serverless environments.
 */
function getBaseUrl(req?: NextApiRequest): string | undefined {
    // First check for explicit NEXTAUTH_URL
    if (process.env.NEXTAUTH_URL) {
        return process.env.NEXTAUTH_URL;
    }

    // For Netlify deployments, try to construct URL from request headers
    if (req) {
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const protocol = req.headers["x-forwarded-proto"] || "https";
        if (host) {
            return `${protocol}://${host}`;
        }
    }

    // Fallback for Netlify URL context
    if (process.env.URL) {
        return process.env.URL;
    }

    return undefined;
}

/**
 * Create NextAuth options with dynamic URL handling for Netlify.
 * Reads environment variables at runtime, not build time.
 */
function createAuthOptions(req?: NextApiRequest): NextAuthOptions {
    return {
        callbacks: {
            session({ session, token }) {
                if (session.user && token.sub) {
                    // eslint-disable-next-line no-param-reassign
                    session.user.id = token.sub;
                }
                return session;
            },
        },
        pages: { signIn: "/auth/signin" },
        providers: [
            GoogleProvider({
                clientId: process.env.GOOGLE_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            }),
            CredentialsProvider({
                authorize(credentials) {
                    if (
                        process.env.TEST_MENUFIC_USER_LOGIN_KEY &&
                        credentials?.loginKey === process.env.TEST_MENUFIC_USER_LOGIN_KEY
                    ) {
                        return { email: "testUser@gmail.com", id: "testUser", image: "", name: "Test User" };
                    }
                    return null;
                },
                credentials: { loginKey: { label: "Login Key", type: "password" } },
                type: "credentials",
            }),
        ],
        secret: process.env.NEXTAUTH_SECRET,
        session: {
            maxAge: 30 * 24 * 60 * 60, // 30 days
            strategy: "jwt",
            updateAge: 24 * 60 * 60, // 24 hours
        },
    };
}

// Export authOptions for use elsewhere (e.g., getServerSideProps)
export const authOptions: NextAuthOptions = createAuthOptions();

// Pages Router handler - uses default export
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Dynamically set NEXTAUTH_URL at runtime if not already set
    const baseUrl = getBaseUrl(req);
    if (baseUrl && !process.env.NEXTAUTH_URL) {
        process.env.NEXTAUTH_URL = baseUrl;
    }

    // Create auth options with request context for proper URL resolution
    const options = createAuthOptions(req);

    return NextAuth(req, res, options);
}
