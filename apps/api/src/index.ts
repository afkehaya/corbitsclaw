import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Context } from "hono";

import { AuthError, InsufficientBalanceError, InvalidRequestError, ForbiddenError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { creditsRoutes } from "./routes/credits.js";
import { stripeRoutes } from "./routes/stripe.js";
import { gatewayRoutes } from "./routes/gateway.js";
import { adminRoutes } from "./routes/admin.js";

const app = new Hono();

// Error handling middleware
app.onError((err: Error, c: Context) => {
  console.error(`Error: ${err.message}`, err);

  if (err instanceof AuthError) {
    return c.json(
      { error: "Authentication failed", message: err.message },
      401
    );
  }

  if (err instanceof InsufficientBalanceError) {
    return c.json(
      { error: "Insufficient balance", message: err.message },
      402
    );
  }

  if (err instanceof InvalidRequestError) {
    return c.json(
      { error: "Invalid request", message: err.message },
      400
    );
  }

  if (err instanceof ForbiddenError) {
    return c.json(
      { error: "Forbidden", message: err.message },
      403
    );
  }

  return c.json(
    { error: "Internal server error", message: "An unexpected error occurred" },
    500
  );
});

// Health check endpoint
app.get("/", (c: Context) => {
  return c.json({ status: "ok", service: "@openclawd/api" });
});

app.get("/health", (c: Context) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Mount route handlers
app.route("/auth", authRoutes);
app.route("/credits", creditsRoutes);
app.route("/stripe", stripeRoutes);
app.route("/gateway", gatewayRoutes);
app.route("/admin", adminRoutes);

// Export for Vercel edge functions
export default app;

// Local development server
if (process.env.NODE_ENV !== "production") {
  const port = Number(process.env.PORT) || 3000;
  console.log(`Server starting on http://localhost:${port}`);
  serve({
    fetch: app.fetch,
    port,
  });
}
