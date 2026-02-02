import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Context } from "hono";

import { AuthError, InsufficientBalanceError, InvalidRequestError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { creditsRoutes } from "./routes/credits.js";

// Placeholder route imports - uncomment and update as routes are implemented
// import { walletRoutes } from "./routes/wallet.js";
// import { paymentRoutes } from "./routes/payment.js";

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

// Mount route handlers - uncomment as routes are implemented
app.route("/auth", authRoutes);
// app.route("/wallet", walletRoutes);
// app.route("/payment", paymentRoutes);
app.route("/credits", creditsRoutes);

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
