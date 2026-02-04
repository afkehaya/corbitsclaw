import { test, type Test } from 'tap';
import type { CreditEntry, Transaction } from '@corbitsclaw/shared';

// =============================================================================
// Test Fixtures
// =============================================================================

// Mock database state
let mockCreditsData: Array<{
  id: string;
  user_id: string;
  amount: string | number;
  type: string;
  description: string | null;
  stripe_session_id: string | null;
  request_id: string | null;
  created_at: string;
}> = [];

let mockTransactionsData: Array<{
  id: string;
  user_id: string;
  request_id: string;
  endpoint: string;
  path: string;
  cost_x402: string | number;
  cost_margin: string | number;
  cost_total: string | number;
  margin_percent: string | number;
  response_status: number | null;
  response_time_ms: number | null;
  created_at: string;
}> = [];

let mockError: { message: string } | null = null;

function resetMocks() {
  mockCreditsData = [];
  mockTransactionsData = [];
  mockError = null;
}

// =============================================================================
// Mock Supabase Client Factory
// =============================================================================

function createMockSupabaseClient() {
  return {
    from: (tableName: string) => {
      let filterUserId: string | null = null;
      let filterGte: { column: string; value: string } | null = null;
      let filterLte: { column: string; value: string } | null = null;
      let insertData: Record<string, unknown> | null = null;

      const query = {
        select: (_columns?: string) => query,
        eq: (column: string, value: string) => {
          if (column === 'user_id') filterUserId = value;
          return query;
        },
        gte: (column: string, value: string) => {
          filterGte = { column, value };
          return query;
        },
        lte: (column: string, value: string) => {
          filterLte = { column, value };
          return query;
        },
        order: (_column: string, _options?: { ascending: boolean }) => query,
        insert: (data: Record<string, unknown>) => {
          insertData = data;
          return query;
        },
        single: () => {
          if (mockError) {
            return Promise.resolve({ data: null, error: mockError });
          }
          if (insertData) {
            const newRecord = {
              id: 'new-id-123',
              ...insertData,
              created_at: new Date().toISOString(),
            };
            return Promise.resolve({ data: newRecord, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then: (
          resolve: (value: { data: unknown; error: unknown }) => void,
          reject?: (err: unknown) => void
        ) => {
          if (mockError) {
            resolve({ data: null, error: mockError });
            return;
          }

          const tableData =
            tableName === 'credits' ? mockCreditsData : mockTransactionsData;
          let filtered = [...tableData];

          if (filterUserId) {
            filtered = filtered.filter((r) => r.user_id === filterUserId);
          }

          if (filterGte && tableName === 'transactions') {
            filtered = filtered.filter((r) => {
              const recordDate = new Date(r.created_at);
              const compareDate = new Date(filterGte!.value);
              return recordDate >= compareDate;
            });
          }

          if (filterLte && tableName === 'transactions') {
            filtered = filtered.filter((r) => {
              const recordDate = new Date(r.created_at);
              const compareDate = new Date(filterLte!.value);
              return recordDate <= compareDate;
            });
          }

          resolve({ data: filtered, error: null });
        },
      };

      return query;
    },
  };
}

// =============================================================================
// Tests: getBalance
// =============================================================================

test('getBalance', async (t: Test) => {
  const { getBalance } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('returns 0 for user with no credits', async (t: Test) => {
    resetMocks();
    mockCreditsData = [];

    const balance = await getBalance('user-123');

    t.equal(balance, 0, 'should return 0 for empty credits');
  });

  await t.test('returns correct sum of deposits and usage', async (t: Test) => {
    resetMocks();
    mockCreditsData = [
      {
        id: '1',
        user_id: 'user-123',
        amount: 100,
        type: 'deposit',
        description: 'Initial deposit',
        stripe_session_id: 'sess_1',
        request_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_id: 'user-123',
        amount: -25,
        type: 'usage',
        description: 'API usage',
        stripe_session_id: null,
        request_id: 'req_1',
        created_at: new Date().toISOString(),
      },
      {
        id: '3',
        user_id: 'user-123',
        amount: 50,
        type: 'deposit',
        description: 'Second deposit',
        stripe_session_id: 'sess_2',
        request_id: null,
        created_at: new Date().toISOString(),
      },
    ];

    const balance = await getBalance('user-123');

    t.equal(
      balance,
      125,
      'should return sum of all amounts (100 - 25 + 50 = 125)'
    );
  });

  await t.test('handles negative amounts correctly', async (t: Test) => {
    resetMocks();
    mockCreditsData = [
      {
        id: '1',
        user_id: 'user-123',
        amount: 50,
        type: 'deposit',
        description: null,
        stripe_session_id: 'sess_1',
        request_id: null,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_id: 'user-123',
        amount: -75,
        type: 'usage',
        description: null,
        stripe_session_id: null,
        request_id: 'req_1',
        created_at: new Date().toISOString(),
      },
    ];

    const balance = await getBalance('user-123');

    t.equal(
      balance,
      -25,
      'should correctly handle negative balance (50 - 75 = -25)'
    );
  });

  await t.test('throws error when Supabase fails', async (t: Test) => {
    resetMocks();
    mockError = { message: 'Database connection failed' };

    await t.rejects(
      getBalance('user-123'),
      { message: 'Failed to fetch balance: Database connection failed' },
      'should throw error with message'
    );

    resetMocks();
  });
});

// =============================================================================
// Tests: recordDeposit
// =============================================================================

test('recordDeposit', async (t: Test) => {
  const { recordDeposit } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('creates credit entry with positive amount', async (t: Test) => {
    resetMocks();

    const result = await recordDeposit('user-123', 100, 'sess_abc');

    t.equal(result.amount, 100, 'amount should be positive');
    t.equal(result.type, 'deposit', 'type should be deposit');
  });

  await t.test('stores stripe session ID', async (t: Test) => {
    resetMocks();

    const result = await recordDeposit('user-123', 50, 'sess_xyz');

    t.equal(
      result.stripeSessionId,
      'sess_xyz',
      'should store stripe session ID'
    );
  });

  await t.test('returns correct CreditEntry structure', async (t: Test) => {
    resetMocks();

    const result = await recordDeposit('user-123', 75, 'sess_test');

    t.ok(result.id, 'should have id');
    t.equal(result.userId, 'user-123', 'should have correct userId');
    t.equal(result.amount, 75, 'should have correct amount');
    t.equal(result.type, 'deposit', 'should have type deposit');
    t.equal(
      result.description,
      'Credit deposit via Stripe',
      'should have default description'
    );
    t.equal(result.stripeSessionId, 'sess_test', 'should have stripeSessionId');
    t.ok(result.createdAt instanceof Date, 'should have createdAt as Date');
  });

  await t.test('throws error for non-positive amount', async (t: Test) => {
    resetMocks();

    await t.rejects(
      recordDeposit('user-123', 0, 'sess_test'),
      { message: 'Deposit amount must be positive' },
      'should reject zero amount'
    );

    await t.rejects(
      recordDeposit('user-123', -10, 'sess_test'),
      { message: 'Deposit amount must be positive' },
      'should reject negative amount'
    );
  });
});

// =============================================================================
// Tests: recordUsage
// =============================================================================

test('recordUsage', async (t: Test) => {
  const { recordUsage } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('creates credit entry with negative amount', async (t: Test) => {
    resetMocks();

    const result = await recordUsage('user-123', 10, 'req_abc');

    t.equal(result.amount, -10, 'amount should be stored as negative');
    t.equal(result.type, 'usage', 'type should be usage');
  });

  await t.test('stores request ID', async (t: Test) => {
    resetMocks();

    const result = await recordUsage('user-123', 5, 'req_xyz');

    t.equal(result.requestId, 'req_xyz', 'should store request ID');
  });

  await t.test('returns correct CreditEntry structure', async (t: Test) => {
    resetMocks();

    const result = await recordUsage(
      'user-123',
      20,
      'req_test',
      'Claude API call'
    );

    t.ok(result.id, 'should have id');
    t.equal(result.userId, 'user-123', 'should have correct userId');
    t.equal(result.amount, -20, 'should have negative amount');
    t.equal(result.type, 'usage', 'should have type usage');
    t.equal(
      result.description,
      'Claude API call',
      'should have custom description'
    );
    t.equal(result.requestId, 'req_test', 'should have requestId');
    t.ok(result.createdAt instanceof Date, 'should have createdAt as Date');
  });

  await t.test(
    'uses default description when not provided',
    async (t: Test) => {
      resetMocks();

      const result = await recordUsage('user-123', 15, 'req_default');

      t.equal(
        result.description,
        'API usage',
        'should use default description'
      );
    }
  );

  await t.test('throws error for non-positive amount', async (t: Test) => {
    resetMocks();

    await t.rejects(
      recordUsage('user-123', 0, 'req_test'),
      { message: 'Usage amount must be positive' },
      'should reject zero amount'
    );

    await t.rejects(
      recordUsage('user-123', -10, 'req_test'),
      { message: 'Usage amount must be positive' },
      'should reject negative amount'
    );
  });
});

// =============================================================================
// Tests: getUsageHistory
// =============================================================================

test('getUsageHistory', async (t: Test) => {
  const { getUsageHistory } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('returns transactions in date range', async (t: Test) => {
    resetMocks();
    const now = new Date();
    const fiveDaysAgo = new Date(now);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    mockTransactionsData = [
      {
        id: 'tx-1',
        user_id: 'user-123',
        request_id: 'req-1',
        endpoint: 'openai',
        path: '/v1/chat/completions',
        cost_x402: 0.01,
        cost_margin: 0.002,
        cost_total: 0.012,
        margin_percent: 20,
        response_status: 200,
        response_time_ms: 150,
        created_at: fiveDaysAgo.toISOString(),
      },
      {
        id: 'tx-2',
        user_id: 'user-123',
        request_id: 'req-2',
        endpoint: 'xai',
        path: '/v1/completions',
        cost_x402: 0.02,
        cost_margin: 0.004,
        cost_total: 0.024,
        margin_percent: 20,
        response_status: 200,
        response_time_ms: 200,
        created_at: now.toISOString(),
      },
    ];

    const result = await getUsageHistory('user-123', 30);

    t.equal(result.transactions.length, 2, 'should return 2 transactions');
    t.ok(result.period.start instanceof Date, 'period.start should be a Date');
    t.ok(result.period.end instanceof Date, 'period.end should be a Date');
  });

  await t.test('calculates total correctly', async (t: Test) => {
    resetMocks();
    const now = new Date();

    mockTransactionsData = [
      {
        id: 'tx-1',
        user_id: 'user-123',
        request_id: 'req-1',
        endpoint: 'openai',
        path: '/v1/chat/completions',
        cost_x402: 0.01,
        cost_margin: 0.002,
        cost_total: 0.1,
        margin_percent: 20,
        response_status: 200,
        response_time_ms: 150,
        created_at: now.toISOString(),
      },
      {
        id: 'tx-2',
        user_id: 'user-123',
        request_id: 'req-2',
        endpoint: 'xai',
        path: '/v1/completions',
        cost_x402: 0.02,
        cost_margin: 0.004,
        cost_total: 0.25,
        margin_percent: 20,
        response_status: 200,
        response_time_ms: 200,
        created_at: now.toISOString(),
      },
    ];

    const result = await getUsageHistory('user-123', 30);

    t.equal(
      result.total,
      0.35,
      'total should be sum of costTotal (0.10 + 0.25 = 0.35)'
    );
  });

  await t.test('handles empty results', async (t: Test) => {
    resetMocks();
    mockTransactionsData = [];

    const result = await getUsageHistory('user-123', 30);

    t.equal(result.transactions.length, 0, 'should return empty array');
    t.equal(result.total, 0, 'total should be 0');
    t.ok(result.period.start instanceof Date, 'should still have period.start');
    t.ok(result.period.end instanceof Date, 'should still have period.end');
  });

  await t.test(
    'uses default 30 days when days not specified',
    async (t: Test) => {
      resetMocks();
      mockTransactionsData = [];

      const result = await getUsageHistory('user-123');

      const daysDiff = Math.round(
        (result.period.end.getTime() - result.period.start.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      t.equal(daysDiff, 30, 'should default to 30 days period');
    }
  );
});

// =============================================================================
// Tests: hasSufficientBalance
// =============================================================================

test('hasSufficientBalance', async (t: Test) => {
  const { hasSufficientBalance } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('returns true when balance >= amount', async (t: Test) => {
    resetMocks();
    mockCreditsData = [
      {
        id: '1',
        user_id: 'user-123',
        amount: 100,
        type: 'deposit',
        description: null,
        stripe_session_id: 'sess_1',
        request_id: null,
        created_at: new Date().toISOString(),
      },
    ];

    const result = await hasSufficientBalance('user-123', 50);
    t.equal(result, true, 'should return true when balance > amount');

    const exactResult = await hasSufficientBalance('user-123', 100);
    t.equal(exactResult, true, 'should return true when balance === amount');
  });

  await t.test('returns false when balance < amount', async (t: Test) => {
    resetMocks();
    mockCreditsData = [
      {
        id: '1',
        user_id: 'user-123',
        amount: 50,
        type: 'deposit',
        description: null,
        stripe_session_id: 'sess_1',
        request_id: null,
        created_at: new Date().toISOString(),
      },
    ];

    const result = await hasSufficientBalance('user-123', 100);

    t.equal(result, false, 'should return false when balance < amount');
  });

  await t.test('returns false when no credits exist', async (t: Test) => {
    resetMocks();
    mockCreditsData = [];

    const result = await hasSufficientBalance('user-123', 10);

    t.equal(result, false, 'should return false when balance is 0');
  });

  await t.test('handles negative balance correctly', async (t: Test) => {
    resetMocks();
    mockCreditsData = [
      {
        id: '1',
        user_id: 'user-123',
        amount: -50,
        type: 'usage',
        description: null,
        stripe_session_id: null,
        request_id: 'req_1',
        created_at: new Date().toISOString(),
      },
    ];

    const result = await hasSufficientBalance('user-123', 0);

    t.equal(result, false, 'should return false when balance is negative');
  });
});

// =============================================================================
// Tests: recordTransaction
// =============================================================================

test('recordTransaction', async (t: Test) => {
  const { recordTransaction } = (await t.mockImport('./ledger.js', {
    '../lib/supabase.js': {
      getSupabaseClient: createMockSupabaseClient,
    },
  })) as typeof import('./ledger.js');

  await t.test('records transaction with all fields', async (t: Test) => {
    resetMocks();

    const input = {
      userId: 'user-123',
      requestId: 'req-abc',
      endpoint: 'openai' as const,
      path: '/v1/chat/completions',
      costX402: 0.01,
      costMargin: 0.002,
      costTotal: 0.012,
      marginPercent: 20,
      responseStatus: 200,
      responseTimeMs: 150,
    };

    const result = await recordTransaction(input);

    t.ok(result.id, 'should have id');
    t.equal(result.userId, 'user-123', 'should have correct userId');
    t.equal(result.requestId, 'req-abc', 'should have correct requestId');
    t.equal(result.endpoint, 'openai', 'should have correct endpoint');
    t.equal(result.path, '/v1/chat/completions', 'should have correct path');
    t.equal(result.costX402, 0.01, 'should have correct costX402');
    t.equal(result.costMargin, 0.002, 'should have correct costMargin');
    t.equal(result.costTotal, 0.012, 'should have correct costTotal');
    t.equal(result.marginPercent, 20, 'should have correct marginPercent');
    t.equal(result.responseStatus, 200, 'should have correct responseStatus');
    t.equal(result.responseTimeMs, 150, 'should have correct responseTimeMs');
    t.ok(result.createdAt instanceof Date, 'should have createdAt as Date');
  });

  await t.test('handles optional fields', async (t: Test) => {
    resetMocks();

    const input = {
      userId: 'user-123',
      requestId: 'req-def',
      endpoint: 'xai' as const,
      path: '/v1/completions',
      costX402: 0.02,
      costMargin: 0.004,
      costTotal: 0.024,
      marginPercent: 20,
      // responseStatus and responseTimeMs omitted
    };

    const result = await recordTransaction(input);

    t.ok(result.id, 'should have id');
    t.equal(
      result.responseStatus,
      undefined,
      'responseStatus should be undefined'
    );
    t.equal(
      result.responseTimeMs,
      undefined,
      'responseTimeMs should be undefined'
    );
  });
});
