// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: "https://dec21b3bff5e37b23747ae72b78d7445@o4509989156093952.ingest.de.sentry.io/4509989156487248",
    integrations: [
        Sentry.consoleLoggingIntegration({
            levels: ["log", "warn", "error"],
        }),
    ],
    enableTracing: true,   // performance monitoring
    enableLogs: true,      // send logs to Sentry
    debug: true,           // helpful for local dev
});
