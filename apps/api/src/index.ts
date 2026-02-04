import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Context } from 'hono';

import {
  AuthError,
  InsufficientBalanceError,
  InvalidRequestError,
  ForbiddenError,
} from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { creditsRoutes } from './routes/credits.js';
import { stripeRoutes } from './routes/stripe.js';
import { gatewayRoutes } from './routes/gateway.js';
import { adminRoutes } from './routes/admin.js';

const app = new Hono();

// Error handling middleware
app.onError((err: Error, c: Context) => {
  console.error(`Error: ${err.message}`, err);

  if (err instanceof AuthError) {
    return c.json(
      { error: 'Authentication failed', message: err.message },
      401
    );
  }

  if (err instanceof InsufficientBalanceError) {
    return c.json({ error: 'Insufficient balance', message: err.message }, 402);
  }

  if (err instanceof InvalidRequestError) {
    return c.json({ error: 'Invalid request', message: err.message }, 400);
  }

  if (err instanceof ForbiddenError) {
    return c.json({ error: 'Forbidden', message: err.message }, 403);
  }

  return c.json(
    { error: 'Internal server error', message: 'An unexpected error occurred' },
    500
  );
});

// Health check endpoint
app.get('/', (c: Context) => {
  return c.json({ status: 'ok', service: '@corbitsclaw/api' });
});

app.get('/health', (c: Context) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Debug endpoints - only available in non-production environments
if (process.env.NODE_ENV !== 'production') {
  // Diagnostic endpoint to test wallet initialization
  app.get('/debug/wallet', async (c: Context) => {
    const { initWallet, isWalletInitialized } = await import(
      './services/wallet.js'
    );

    try {
      const wasInitialized = isWalletInitialized();
      await initWallet();

      return c.json({
        success: true,
        wasAlreadyInitialized: wasInitialized,
        hasPrivateKey: !!process.env.SOLANA_PRIVATE_KEY,
        privateKeyLength: process.env.SOLANA_PRIVATE_KEY?.length ?? 0,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          hasPrivateKey: !!process.env.SOLANA_PRIVATE_KEY,
          privateKeyLength: process.env.SOLANA_PRIVATE_KEY?.length ?? 0,
        },
        500
      );
    }
  });

  // Diagnostic endpoint to test x402 request with timing
  app.get('/debug/x402', async (c: Context) => {
    const { initWallet, makeX402Request, isWalletInitialized } = await import(
      './services/wallet.js'
    );
    const timings: Record<string, number> = {};
    const start = Date.now();

    try {
      timings.start = 0;

      // Init wallet
      const initStart = Date.now();
      if (!isWalletInitialized()) {
        await initWallet();
      }
      timings.walletInit = Date.now() - initStart;

      // Make a simple x402 request
      const reqStart = Date.now();
      const result = await makeX402Request(
        'https://xai.alez-848f79.api.corbits.dev',
        '/',
        {
          model: 'grok-3-mini',
          input: 'Say hello briefly',
        },
        'POST',
        { allowZeroCost: true }
      );
      timings.x402Request = Date.now() - reqStart;
      timings.total = Date.now() - start;

      return c.json({
        success: true,
        timings,
        costPaid: result.costPaid,
        responsePreview: JSON.stringify(result.data).slice(0, 200),
      });
    } catch (error) {
      timings.total = Date.now() - start;
      return c.json(
        {
          success: false,
          timings,
          error: error instanceof Error ? error.message : String(error),
          stack:
            error instanceof Error
              ? error.stack?.split('\n').slice(0, 5)
              : undefined,
        },
        500
      );
    }
  });
}

// Mount route handlers
app.route('/auth', authRoutes);
app.route('/credits', creditsRoutes);
app.route('/stripe', stripeRoutes);
app.route('/gateway', gatewayRoutes);
app.route('/admin', adminRoutes);

// Export for Vercel
export default app;

// Local development server
if (process.env.NODE_ENV !== 'production') {
  const port = Number(process.env.PORT) || 3000;
  console.log(`Server starting on http://localhost:${port}`);
  serve({
    fetch: app.fetch,
    port,
  });
}
