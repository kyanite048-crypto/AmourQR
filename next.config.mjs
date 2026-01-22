// @ts-check
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds and Netlify deployments.
 * On Netlify, certain env vars like NEXTAUTH_URL are set at runtime,
 * so we skip validation at build time to avoid failures.
 */
const isNetlify = process.env.NETLIFY === "true";
if (!process.env.SKIP_ENV_VALIDATION && !isNetlify) {
    await import("./src/env/server.mjs");
}

/** @type {import("next").NextConfig} */
const config = {
    i18n: { defaultLocale: "en", locales: ["en"] },
    images: {
        formats: ["image/avif", "image/webp"],
        remotePatterns: [
            { hostname: "ik.imagekit.io", pathname: "/**", protocol: "https" },
            { hostname: "lh3.googleusercontent.com", pathname: "/**", protocol: "https" },
        ],
        unoptimized: true,
    },
    reactStrictMode: true,
    sentry: {
        hideSourceMaps: true,
    },
    swcMinify: true,
};

// Only enable Sentry source map uploads when all required credentials are present
const hasSentryCredentials = !!(
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
);

const sentryWebpackPluginOptions = {
    // Enable Sentry uploads only if credentials are fully configured
    // This prevents build failures when Sentry credentials are not set
    dryRun: !hasSentryCredentials,
    silent: true,
};

export default withSentryConfig(config, sentryWebpackPluginOptions);
