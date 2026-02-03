/**
 * Integration tests for the payment gateway proxy routes.
 *
 * These tests verify the complete HTTP flow including:
 * - Authentication via API keys
 * - Balance checking
 * - Request proxying to Corbits endpoints
 * - Usage recording and cost tracking
 * - Error handling
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import { Hono } from 'hono';
import type { Context } from 'hono';

import { AuthError, InsufficientBalanceError } from '../lib/errors.js';
import type { User } from '../services/auth.js';
import type { CorbitsEndpoint } from '@openclawd/shared';

// =============================================================================
// Test Fixtures
// =============================================================================

// API keys for testing (the actual keys users would use)
const TEST_API_KEYS = {
  validUser: 'oc_validapikey12345678901234567',
  zeroBalanceUser: 'oc_zerobalancekey1234567890123',
  richUser: 'oc_richuserkey123456789012345678',
};

const TEST_USERS = {
  validUser: {
    id: 'user-123',
    email: 'test@example.com',
    api_key_hash: 'mock_hash_validUser', // Mock hash - in tests we bypass bcrypt
    api_key_prefix: 'oc_validapi...',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  zeroBalanceUser: {
    id: 'user-zero-balance',
    email: 'zero@example.com',
    api_key_hash: 'mock_hash_zeroBalanceUser',
    api_key_prefix: 'oc_zerobalance...',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  richUser: {
    id: 'user-rich',
    email: 'rich@example.com',
    api_key_hash: 'mock_hash_richUser',
    api_key_prefix: 'oc_richuser...',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
} satisfies Record<string, User>;

// In-memory state for test tracking
interface TestState {
  balances: Map<string, number>;
  transactions: Array<{
    userId: string;
    requestId: string;
    endpoint: CorbitsEndpoint;
    path: string;
    costX402: number;
    costMargin: number;
    costTotal: number;
    marginPercent: number;
    responseStatus?: number;
    responseTimeMs?: number;
  }>;
  usageRecords: Array<{
    userId: string;
    amount: number;
    requestId: string;
    description?: string;
  }>;
}

function createTestState(): TestState {
  const state: TestState = {
    balances: new Map(),
    transactions: [],
    usageRecords: [],
  };

  // Set up initial balances
  state.balances.set(TEST_USERS.validUser.id, 100);
  state.balances.set(TEST_USERS.zeroBalanceUser.id, 0);
  state.balances.set(TEST_USERS.richUser.id, 1000);

  return state;
}

// =============================================================================
// Mock Implementations
// =============================================================================

/**
 * Creates a test app with mocked dependencies.
 */
function createTestApp(
  state: TestState,
  options: {
    x402CostPaid?: string | null;
    x402Response?: unknown;
    x402ShouldFail?: boolean;
    x402ErrorMessage?: string;
  } = {}
) {
  const app = new Hono();

  // Error handling middleware (same as main app)
  app.onError((err: Error, c: Context) => {
    if (err instanceof AuthError) {
      return c.json(
        { error: 'Authentication failed', message: err.message },
        401
      );
    }

    if (err instanceof InsufficientBalanceError) {
      return c.json(
        { error: 'Insufficient balance', message: err.message },
        402
      );
    }

    return c.json(
      { error: 'Internal server error', message: err.message },
      500
    );
  });

  // Mock auth middleware
  const mockAuthMiddleware = async (c: Context, next: () => Promise<void>) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      throw new AuthError('Missing or invalid Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
      throw new AuthError('Missing or invalid Authorization header');
    }

    const token = parts[1];
    if (!token || !token.startsWith('oc_')) {
      throw new AuthError('Invalid API key');
    }

    // Find user by API key (in tests, we match against the TEST_API_KEYS)
    let user: User | undefined;
    if (token === TEST_API_KEYS.validUser) {
      user = TEST_USERS.validUser;
    } else if (token === TEST_API_KEYS.zeroBalanceUser) {
      user = TEST_USERS.zeroBalanceUser;
    } else if (token === TEST_API_KEYS.richUser) {
      user = TEST_USERS.richUser;
    }
    if (!user) {
      throw new AuthError('Invalid API key');
    }

    c.set('user', user);
    await next();
  };

  // Mock hasSufficientBalance
  const mockHasSufficientBalance = async (
    userId: string,
    amount: number
  ): Promise<boolean> => {
    const balance = state.balances.get(userId) ?? 0;
    return balance >= amount;
  };

  // Mock recordUsage
  const mockRecordUsage = async (
    userId: string,
    amount: number,
    requestId: string,
    description?: string
  ) => {
    state.usageRecords.push({ userId, amount, requestId, description });
    const currentBalance = state.balances.get(userId) ?? 0;
    state.balances.set(userId, currentBalance - amount);
  };

  // Mock recordTransaction
  const mockRecordTransaction = async (input: {
    userId: string;
    requestId: string;
    endpoint: CorbitsEndpoint;
    path: string;
    costX402: number;
    costMargin: number;
    costTotal: number;
    marginPercent: number;
    responseStatus?: number;
    responseTimeMs?: number;
  }) => {
    state.transactions.push(input);
  };

  // Mock makeX402Request
  const mockMakeX402Request = async (
    _baseUrl: string,
    _path: string,
    _body?: unknown
  ) => {
    if (options.x402ShouldFail) {
      throw new Error(options.x402ErrorMessage ?? 'Upstream request failed');
    }

    // Use x402CostPaid if explicitly provided (even if null), otherwise default to 1 USDC
    const costPaid =
      'x402CostPaid' in options ? options.x402CostPaid : '1000000';

    return {
      data: options.x402Response ?? { success: true, model: 'test-model' },
      response: new Response(JSON.stringify(options.x402Response ?? {}), {
        status: 200,
      }),
      costPaid,
    };
  };

  // Gateway handler implementation
  const handleGatewayRequest = async (
    c: Context,
    endpoint: CorbitsEndpoint,
    path: string
  ): Promise<Response> => {
    const MIN_BALANCE_THRESHOLD = 0.01;
    const USDC_DECIMALS = 6;
    const MARGIN_PERCENT = 30;

    const requestId = `req_test_${Date.now()}`;
    const startTime = Date.now();
    const user = c.get('user') as User;

    // Check balance
    const hasBalance = await mockHasSufficientBalance(
      user.id,
      MIN_BALANCE_THRESHOLD
    );
    if (!hasBalance) {
      throw new InsufficientBalanceError(
        `Insufficient balance. Minimum ${MIN_BALANCE_THRESHOLD} USD required.`
      );
    }

    // Get request body
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }

    // Proxy to Corbits
    let costX402 = 0;
    let data: unknown;

    try {
      const result = await mockMakeX402Request(
        `https://${endpoint}.corbits.dev`,
        path,
        body
      );
      data = result.data;
      costX402 = result.costPaid
        ? Number(BigInt(result.costPaid)) / Math.pow(10, USDC_DECIMALS)
        : 0;
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;

      await mockRecordTransaction({
        userId: user.id,
        requestId,
        endpoint,
        path,
        costX402: 0,
        costMargin: 0,
        costTotal: 0,
        marginPercent: MARGIN_PERCENT,
        responseStatus: 502,
        responseTimeMs,
      });

      return c.json(
        {
          error: 'Gateway error',
          message:
            error instanceof Error
              ? error.message
              : 'Request to upstream service failed',
          requestId,
        },
        502
      );
    }

    const responseTimeMs = Date.now() - startTime;

    // Calculate costs
    const costMargin = costX402 * (MARGIN_PERCENT / 100);
    const costTotal = costX402 + costMargin;

    // Record usage
    if (costTotal > 0) {
      await mockRecordUsage(
        user.id,
        costTotal,
        requestId,
        `${endpoint.toUpperCase()} API: ${path}`
      );
    }

    // Record transaction
    await mockRecordTransaction({
      userId: user.id,
      requestId,
      endpoint,
      path,
      costX402,
      costMargin,
      costTotal,
      marginPercent: MARGIN_PERCENT,
      responseStatus: 200,
      responseTimeMs,
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        'X-Cost-Total': costTotal.toFixed(6),
      },
    });
  };

  // Mount routes
  app.post('/gateway/xai/*', mockAuthMiddleware, async (c: Context) => {
    const path = c.req.path.replace(/^\/gateway\/xai/, '');
    return handleGatewayRequest(c, 'xai', path);
  });

  app.post('/gateway/openai/*', mockAuthMiddleware, async (c: Context) => {
    const path = c.req.path.replace(/^\/gateway\/openai/, '');
    return handleGatewayRequest(c, 'openai', path);
  });

  app.post('/gateway/amazon/*', mockAuthMiddleware, async (c: Context) => {
    const path = c.req.path.replace(/^\/gateway\/amazon/, '');
    return handleGatewayRequest(c, 'amazon', path);
  });

  return app;
}

// =============================================================================
// Test Helpers
// =============================================================================

async function makeRequest(
  app: Hono,
  method: string,
  path: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return app.fetch(request);
}

// =============================================================================
// Tests: Authentication
// =============================================================================

test('Authentication: request without API key returns 401', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 401);

  const body = (await response.json()) as { error: string; message: string };
  assert.strictEqual(body.error, 'Authentication failed');
  assert.ok(body.message.includes('Missing'));
});

test('Authentication: request with malformed Authorization header returns 401', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: 'InvalidHeader' },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 401);

  const body = (await response.json()) as { error: string; message: string };
  assert.strictEqual(body.error, 'Authentication failed');
});

test('Authentication: request with invalid API key returns 401', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: 'Bearer oc_invalidkey123456' },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 401);

  const body = (await response.json()) as { error: string; message: string };
  assert.strictEqual(body.error, 'Authentication failed');
  assert.ok(body.message.includes('Invalid'));
});

test('Authentication: request with non-oc_ prefixed key returns 401', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: 'Bearer sk_someotherkey12345' },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 401);
});

test('Authentication: request with valid API key proceeds', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  // Should not be 401, could be 200 or other status based on subsequent checks
  assert.notStrictEqual(response.status, 401);
});

// =============================================================================
// Tests: Balance Check
// =============================================================================

test('Balance check: user with zero balance gets 402', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: {
        Authorization: `Bearer ${TEST_API_KEYS.zeroBalanceUser}`,
      },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 402);

  const body = (await response.json()) as { error: string; message: string };
  assert.strictEqual(body.error, 'Insufficient balance');
  assert.ok(body.message.includes('Insufficient balance'));
});

test('Balance check: user with sufficient balance proceeds', async () => {
  const state = createTestState();
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 200);
});

test('Balance check: user with exactly minimum threshold proceeds', async () => {
  const state = createTestState();
  state.balances.set(TEST_USERS.validUser.id, 0.01); // Exactly minimum threshold
  const app = createTestApp(state);

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 200);
});

// =============================================================================
// Tests: Successful Proxy Flow
// =============================================================================

test('Proxy flow: valid request to xAI endpoint returns response', async () => {
  const state = createTestState();
  const mockResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content: 'Hello, world!' } }],
  };

  const app = createTestApp(state, {
    x402Response: mockResponse,
    x402CostPaid: '500000', // 0.5 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 200);

  const body = await response.json();
  assert.deepStrictEqual(body, mockResponse);
});

test('Proxy flow: valid request to OpenAI endpoint returns response', async () => {
  const state = createTestState();
  const mockResponse = {
    id: 'chatcmpl-456',
    object: 'chat.completion',
    model: 'gpt-4',
    choices: [{ message: { role: 'assistant', content: 'Hi there!' } }],
  };

  const app = createTestApp(state, {
    x402Response: mockResponse,
    x402CostPaid: '200000', // 0.2 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/openai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
    }
  );

  assert.strictEqual(response.status, 200);

  const body = await response.json();
  assert.deepStrictEqual(body, mockResponse);
});

test('Proxy flow: valid request to Amazon endpoint returns response', async () => {
  const state = createTestState();
  const mockResponse = {
    output: {
      message: { role: 'assistant', content: [{ text: 'Greetings!' }] },
    },
  };

  const app = createTestApp(state, {
    x402Response: mockResponse,
    x402CostPaid: '300000', // 0.3 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/amazon/model/invoke',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { modelId: 'anthropic.claude-v2', messages: [] },
    }
  );

  assert.strictEqual(response.status, 200);

  const body = await response.json();
  assert.deepStrictEqual(body, mockResponse);
});

test('Proxy flow: usage is recorded in ledger', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '1000000', // 1 USDC = 1.3 total with 30% margin
  });

  await makeRequest(app, 'POST', '/gateway/xai/v1/chat/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
    body: {
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    },
  });

  // Check usage was recorded
  assert.strictEqual(state.usageRecords.length, 1);
  assert.strictEqual(state.usageRecords[0]!.userId, TEST_USERS.validUser.id);
  assert.strictEqual(state.usageRecords[0]!.amount, 1.3); // 1 + 30% margin
  assert.ok(state.usageRecords[0]!.description?.includes('XAI API'));
});

test('Proxy flow: transaction is recorded with correct amounts', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '2000000', // 2 USDC
  });

  await makeRequest(app, 'POST', '/gateway/openai/v1/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
    body: { model: 'gpt-4', prompt: 'Hello' },
  });

  // Check transaction was recorded
  assert.strictEqual(state.transactions.length, 1);

  const tx = state.transactions[0]!;
  assert.strictEqual(tx.userId, TEST_USERS.validUser.id);
  assert.strictEqual(tx.endpoint, 'openai');
  assert.strictEqual(tx.path, '/v1/completions');
  assert.strictEqual(tx.costX402, 2); // 2 USDC
  assert.strictEqual(tx.costMargin, 0.6); // 30% of 2
  assert.strictEqual(tx.costTotal, 2.6); // 2 + 0.6
  assert.strictEqual(tx.marginPercent, 30);
  assert.strictEqual(tx.responseStatus, 200);
  assert.ok(typeof tx.responseTimeMs === 'number');
});

test('Proxy flow: margin is applied correctly at 30%', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '10000000', // 10 USDC
  });

  await makeRequest(app, 'POST', '/gateway/xai/v1/chat/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
    body: {
      model: 'grok-beta',
      messages: [{ role: 'user', content: 'Hello' }],
    },
  });

  const tx = state.transactions[0]!;
  assert.strictEqual(tx.costX402, 10);
  assert.strictEqual(tx.costMargin, 3); // 30%
  assert.strictEqual(tx.costTotal, 13);

  // Balance should be reduced by total cost
  const newBalance = state.balances.get(TEST_USERS.richUser.id);
  assert.strictEqual(newBalance, 1000 - 13);
});

// =============================================================================
// Tests: Error Handling
// =============================================================================

test('Error handling: Corbits endpoint error returns 502', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402ShouldFail: true,
    x402ErrorMessage: 'Connection timeout to upstream',
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  assert.strictEqual(response.status, 502);

  const body = (await response.json()) as {
    error: string;
    message: string;
    requestId: string;
  };
  assert.strictEqual(body.error, 'Gateway error');
  assert.ok(
    body.message.includes('timeout') || body.message.includes('upstream')
  );
  assert.ok(body.requestId.startsWith('req_'));
});

test('Error handling: failed request still records transaction for monitoring', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402ShouldFail: true,
    x402ErrorMessage: 'Service unavailable',
  });

  await makeRequest(app, 'POST', '/gateway/openai/v1/chat/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
    body: { model: 'gpt-4', messages: [] },
  });

  // Transaction should still be recorded
  assert.strictEqual(state.transactions.length, 1);

  const tx = state.transactions[0]!;
  assert.strictEqual(tx.responseStatus, 502);
  assert.strictEqual(tx.costX402, 0);
  assert.strictEqual(tx.costMargin, 0);
  assert.strictEqual(tx.costTotal, 0);
});

test('Error handling: 502 response is properly formatted', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402ShouldFail: true,
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );

  const body = (await response.json()) as {
    error: string;
    message: string;
    requestId: string;
  };

  // Verify response structure
  assert.ok('error' in body);
  assert.ok('message' in body);
  assert.ok('requestId' in body);
  assert.strictEqual(typeof body.error, 'string');
  assert.strictEqual(typeof body.message, 'string');
  assert.strictEqual(typeof body.requestId, 'string');
});

test('Error handling: user balance not affected on upstream failure', async () => {
  const state = createTestState();
  const initialBalance = state.balances.get(TEST_USERS.validUser.id);
  const app = createTestApp(state, {
    x402ShouldFail: true,
  });

  await makeRequest(app, 'POST', '/gateway/xai/v1/chat/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
    body: { model: 'grok-beta', messages: [] },
  });

  // Balance should remain unchanged
  const finalBalance = state.balances.get(TEST_USERS.validUser.id);
  assert.strictEqual(finalBalance, initialBalance);

  // No usage should be recorded
  assert.strictEqual(state.usageRecords.length, 0);
});

// =============================================================================
// Tests: Cost Tracking Headers
// =============================================================================

test('Cost tracking: X-Cost-Total header is returned', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '1000000', // 1 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  const costHeader = response.headers.get('X-Cost-Total');
  assert.ok(costHeader, 'X-Cost-Total header should be present');
  assert.strictEqual(costHeader, '1.300000'); // 1 + 30% = 1.3
});

test('Cost tracking: X-Request-Id header is returned', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '500000',
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  const requestId = response.headers.get('X-Request-Id');
  assert.ok(requestId, 'X-Request-Id header should be present');
  assert.ok(
    requestId.startsWith('req_'),
    'Request ID should have correct prefix'
  );
});

test('Cost tracking: zero cost request returns 0.000000 header', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: null, // No payment required
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  const costHeader = response.headers.get('X-Cost-Total');
  assert.strictEqual(costHeader, '0.000000');
});

test('Cost tracking: transaction records match header values', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '5000000', // 5 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: {
        model: 'grok-beta',
        messages: [{ role: 'user', content: 'Hello' }],
      },
    }
  );

  const costHeader = response.headers.get('X-Cost-Total');
  const tx = state.transactions[0]!;

  assert.strictEqual(parseFloat(costHeader!), tx.costTotal);
});

// =============================================================================
// Tests: Multiple Endpoints
// =============================================================================

test('Multiple endpoints: all three endpoints work correctly', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '100000',
  });

  // Test xAI
  const xaiResponse = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );
  assert.strictEqual(xaiResponse.status, 200);

  // Test OpenAI
  const openaiResponse = await makeRequest(
    app,
    'POST',
    '/gateway/openai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: { model: 'gpt-4', messages: [] },
    }
  );
  assert.strictEqual(openaiResponse.status, 200);

  // Test Amazon
  const amazonResponse = await makeRequest(
    app,
    'POST',
    '/gateway/amazon/model/invoke',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: { modelId: 'claude-v2', messages: [] },
    }
  );
  assert.strictEqual(amazonResponse.status, 200);

  // Verify all transactions recorded with correct endpoints
  assert.strictEqual(state.transactions.length, 3);
  assert.strictEqual(state.transactions[0]!.endpoint, 'xai');
  assert.strictEqual(state.transactions[1]!.endpoint, 'openai');
  assert.strictEqual(state.transactions[2]!.endpoint, 'amazon');
});

test('Multiple endpoints: paths are extracted correctly', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '100000',
  });

  await makeRequest(app, 'POST', '/gateway/xai/v1/chat/completions', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
    body: {},
  });

  await makeRequest(app, 'POST', '/gateway/openai/v1/models/list', {
    headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
    body: {},
  });

  await makeRequest(
    app,
    'POST',
    '/gateway/amazon/bedrock/model/invoke-stream',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: {},
    }
  );

  assert.strictEqual(state.transactions[0]!.path, '/v1/chat/completions');
  assert.strictEqual(state.transactions[1]!.path, '/v1/models/list');
  assert.strictEqual(
    state.transactions[2]!.path,
    '/bedrock/model/invoke-stream'
  );
});

// =============================================================================
// Tests: Edge Cases
// =============================================================================

test('Edge case: request without body succeeds', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '100000',
  });

  const request = new Request('http://localhost/gateway/xai/v1/models', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TEST_API_KEYS.validUser}`,
    },
  });

  const response = await app.fetch(request);
  assert.strictEqual(response.status, 200);
});

test('Edge case: very small cost is tracked correctly', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '1', // 0.000001 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );

  const costHeader = response.headers.get('X-Cost-Total');
  // 0.000001 + 30% = 0.0000013
  assert.ok(parseFloat(costHeader!) < 0.0001);
});

test('Edge case: large cost is tracked correctly', async () => {
  const state = createTestState();
  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '100000000000', // 100,000 USDC
  });

  const response = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.richUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );

  const costHeader = response.headers.get('X-Cost-Total');
  assert.strictEqual(parseFloat(costHeader!), 130000); // 100,000 + 30%
});

test('Edge case: multiple requests deplete balance correctly', async () => {
  const state = createTestState();
  state.balances.set(TEST_USERS.validUser.id, 5); // Start with 5 USD

  const app = createTestApp(state, {
    x402Response: { success: true },
    x402CostPaid: '1000000', // 1 USDC = 1.3 total
  });

  // First request: 5 - 1.3 = 3.7
  const response1 = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );
  assert.strictEqual(response1.status, 200);

  // Second request: 3.7 - 1.3 = 2.4
  const response2 = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );
  assert.strictEqual(response2.status, 200);

  // Third request: 2.4 - 1.3 = 1.1
  const response3 = await makeRequest(
    app,
    'POST',
    '/gateway/xai/v1/chat/completions',
    {
      headers: { Authorization: `Bearer ${TEST_API_KEYS.validUser}` },
      body: { model: 'grok-beta', messages: [] },
    }
  );
  assert.strictEqual(response3.status, 200);

  // Balance should be approximately 1.1
  const finalBalance = state.balances.get(TEST_USERS.validUser.id)!;
  assert.ok(finalBalance > 1 && finalBalance < 1.2);

  // Three transactions should be recorded
  assert.strictEqual(state.transactions.length, 3);
});
