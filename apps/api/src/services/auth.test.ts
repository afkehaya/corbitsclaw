import { test, type Test } from 'tap';

import bcrypt from 'bcryptjs';

/**
 * Unit tests for the auth service.
 *
 * These tests use tap's mockImport to mock dependencies:
 * - ../lib/supabase.js - Database client
 * - ./email.js - Email sending service
 */

test('generateApiKey', async (t: Test) => {
  const mockSupabase = {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  };

  const { generateApiKey } = (await t.mockImport('./auth.js', {
    '../lib/supabase.js': {
      getSupabaseClient: () => mockSupabase,
    },
    './email.js': { sendMagicLink: async () => {} },
  })) as typeof import('./auth.js');

  await t.test(
    'returns object with fullKey, hash, and visiblePrefix',
    async (t: Test) => {
      const result = await generateApiKey();

      t.ok(result.fullKey, 'Should return a full key');
      t.ok(result.hash, 'Should return a hash');
      t.ok(result.visiblePrefix, 'Should return a visible prefix');
    }
  );

  await t.test('fullKey starts with oc_ prefix', async (t: Test) => {
    const result = await generateApiKey();

    t.ok(
      result.fullKey.startsWith('oc_'),
      'Full key should start with oc_ prefix'
    );
    t.equal(
      result.fullKey.length,
      35,
      'Full key should be 35 characters (oc_ + 32 hex chars)'
    );
  });

  await t.test('visiblePrefix has correct format', async (t: Test) => {
    const result = await generateApiKey();

    t.ok(
      result.visiblePrefix.startsWith('oc_'),
      'Visible prefix should start with oc_'
    );
    t.ok(
      result.visiblePrefix.endsWith('...'),
      'Visible prefix should end with ...'
    );
    t.equal(
      result.visiblePrefix.length,
      14,
      'Visible prefix should be 14 chars (oc_ + 8 + ...)'
    );
  });

  await t.test('hash can verify the fullKey', async (t: Test) => {
    const result = await generateApiKey();

    const isValid = await bcrypt.compare(result.fullKey, result.hash);
    t.ok(isValid, 'Hash should verify the full key');
  });

  await t.test('generates unique keys', async (t: Test) => {
    const keys = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = await generateApiKey();
      keys.add(result.fullKey);
    }
    t.equal(keys.size, 10, 'All 10 generated keys should be unique');
  });

  await t.test(
    'contains only alphanumeric characters after prefix',
    async (t: Test) => {
      const result = await generateApiKey();
      const randomPart = result.fullKey.slice(3); // Remove 'oc_' prefix
      t.match(
        randomPart,
        /^[a-f0-9]+$/,
        'Random part should be hex characters'
      );
    }
  );
});

test('generateMagicLink', async (t: Test) => {
  // Track mock state
  let insertedMagicLink: {
    email: string;
    token: string;
    expires_at: string;
  } | null = null;
  let sentEmail: { email: string; token: string } | null = null;

  const mockSupabase = {
    from: (table: string) => ({
      insert: async (data: {
        email: string;
        token: string;
        expires_at: string;
      }) => {
        if (table === 'magic_links') {
          insertedMagicLink = data;
        }
        return { error: null };
      },
    }),
  };

  const mockEmail = {
    sendMagicLink: async (email: string, token: string) => {
      sentEmail = { email, token };
    },
  };

  const { generateMagicLink } = (await t.mockImport('./auth.js', {
    '../lib/supabase.js': {
      getSupabaseClient: () => mockSupabase,
    },
    './email.js': mockEmail,
  })) as typeof import('./auth.js');

  await t.test(
    'creates magic link token and stores in database',
    async (t: Test) => {
      insertedMagicLink = null;
      sentEmail = null;

      await generateMagicLink('test@example.com');

      t.ok(insertedMagicLink, 'Should insert magic link into database');
      t.equal(
        insertedMagicLink?.email,
        'test@example.com',
        'Should store correct email'
      );
      t.ok(insertedMagicLink?.token, 'Should generate a token');
      t.ok(insertedMagicLink?.token.length > 0, 'Token should not be empty');
    }
  );

  await t.test(
    'normalizes email to lowercase and trims whitespace',
    async (t: Test) => {
      insertedMagicLink = null;
      sentEmail = null;

      await generateMagicLink('  TEST@Example.COM  ');

      t.equal(
        insertedMagicLink?.email,
        'test@example.com',
        'Email should be normalized'
      );
    }
  );

  await t.test('token expires in 15 minutes', async (t: Test) => {
    insertedMagicLink = null;
    const beforeTime = Date.now();

    await generateMagicLink('test@example.com');

    const afterTime = Date.now();
    const expiresAt = new Date(insertedMagicLink?.expires_at || '').getTime();
    const expectedMinExpiry = beforeTime + 15 * 60 * 1000;
    const expectedMaxExpiry = afterTime + 15 * 60 * 1000;

    t.ok(
      expiresAt >= expectedMinExpiry - 1000,
      'Expiry should be at least 15 minutes from now'
    );
    t.ok(
      expiresAt <= expectedMaxExpiry + 1000,
      'Expiry should be at most 15 minutes from now'
    );
  });

  await t.test('sends magic link email', async (t: Test) => {
    insertedMagicLink = null;
    sentEmail = null;

    await generateMagicLink('test@example.com');

    t.ok(sentEmail, 'Should send email');
    t.equal(
      sentEmail?.email,
      'test@example.com',
      'Should send to correct email'
    );
    t.equal(
      sentEmail?.token,
      insertedMagicLink?.token,
      'Should send correct token'
    );
  });

  await t.test('throws error if database insert fails', async (t: Test) => {
    const failingMockSupabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'Database error' } }),
      }),
    };

    const { generateMagicLink: failingGenerateMagicLink } = (await t.mockImport(
      './auth.js',
      {
        '../lib/supabase.js': {
          getSupabaseClient: () => failingMockSupabase,
        },
        './email.js': mockEmail,
      }
    )) as typeof import('./auth.js');

    await t.rejects(
      failingGenerateMagicLink('test@example.com'),
      /Failed to create magic link/,
      'Should throw error on database failure'
    );
  });
});

test('verifyMagicLink', async (t: Test) => {
  // Mock database state
  const magicLinks = new Map<
    string,
    {
      id: string;
      email: string;
      token: string;
      expires_at: string;
      used_at: string | null;
    }
  >();
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      api_key_hash: string;
      api_key_prefix: string;
    }
  >();

  const createMockSupabase = () => ({
    from: (table: string) => {
      const baseQuery = {
        select: () => baseQuery,
        eq: (column: string, value: string) => {
          const eqQuery = {
            ...baseQuery,
            single: async () => {
              if (table === 'magic_links' && column === 'token') {
                const ml = magicLinks.get(value);
                if (ml) return { data: ml, error: null };
                return {
                  data: null,
                  error: { code: 'PGRST116', message: 'not found' },
                };
              }
              if (table === 'users' && column === 'email') {
                const user = users.get(value);
                if (user) return { data: user, error: null };
                return {
                  data: null,
                  error: { code: 'PGRST116', message: 'not found' },
                };
              }
              return {
                data: null,
                error: { code: 'PGRST116', message: 'not found' },
              };
            },
          };
          return eqQuery;
        },
        update: (data: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            if (table === 'magic_links' && column === 'id') {
              for (const [token, ml] of magicLinks) {
                if (ml.id === value) {
                  magicLinks.set(token, { ...ml, ...data } as typeof ml);
                }
              }
            }
            return Promise.resolve({ error: null });
          },
        }),
        insert: async (data: Record<string, unknown>) => {
          if (table === 'users') {
            users.set(data.email as string, {
              id: `user_${Date.now()}`,
              email: data.email as string,
              api_key_hash: data.api_key_hash as string,
              api_key_prefix: data.api_key_prefix as string,
            });
          }
          return { error: null };
        },
        single: async () => ({
          data: null,
          error: { code: 'PGRST116', message: 'not found' },
        }),
      };
      return baseQuery;
    },
  });

  await t.test(
    'valid token returns user info and API key for new user',
    async (t: Test) => {
      magicLinks.clear();
      users.clear();

      const validToken = 'valid-token-123';
      magicLinks.set(validToken, {
        id: 'ml_1',
        email: 'newuser@example.com',
        token: validToken,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min from now
        used_at: null,
      });

      const { verifyMagicLink } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const result = await verifyMagicLink(validToken);

      t.ok(result.apiKey, 'Should return an API key for new user');
      t.ok(
        result.apiKey?.startsWith('oc_'),
        'API key should have correct prefix'
      );
      t.ok(result.apiKeyPrefix, 'Should return a visible prefix');
      t.ok(
        result.apiKeyPrefix.endsWith('...'),
        'Visible prefix should end with ...'
      );
      t.equal(
        result.email,
        'newuser@example.com',
        'Should return correct email'
      );
      t.equal(result.isNewUser, true, 'Should indicate new user');
    }
  );

  await t.test(
    'valid token returns null apiKey for existing user',
    async (t: Test) => {
      magicLinks.clear();
      users.clear();

      const validToken = 'valid-token-456';
      const existingHash = await bcrypt.hash(
        'oc_existingkey1234567890abcdef',
        10
      );

      magicLinks.set(validToken, {
        id: 'ml_2',
        email: 'existing@example.com',
        token: validToken,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used_at: null,
      });

      users.set('existing@example.com', {
        id: 'user_existing',
        email: 'existing@example.com',
        api_key_hash: existingHash,
        api_key_prefix: 'oc_existing...',
      });

      const { verifyMagicLink } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const result = await verifyMagicLink(validToken);

      t.equal(
        result.apiKey,
        null,
        'Should return null API key for existing user (they should use saved key)'
      );
      t.equal(
        result.apiKeyPrefix,
        'oc_existing...',
        'Should return visible prefix'
      );
      t.equal(
        result.email,
        'existing@example.com',
        'Should return correct email'
      );
      t.equal(result.isNewUser, false, 'Should indicate existing user');
    }
  );

  await t.test('invalid token throws AuthError', async (t: Test) => {
    magicLinks.clear();
    users.clear();

    const { verifyMagicLink } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const { AuthError } = await import('../lib/errors.js');

    try {
      await verifyMagicLink('nonexistent-token');
      t.fail('Should have thrown an error');
    } catch (error) {
      t.ok(error instanceof AuthError, 'Should throw AuthError');
      t.match(
        (error as Error).message,
        /Invalid or expired/,
        'Should have correct error message'
      );
    }
  });

  await t.test('expired token throws AuthError', async (t: Test) => {
    magicLinks.clear();
    users.clear();

    const expiredToken = 'expired-token-123';
    magicLinks.set(expiredToken, {
      id: 'ml_3',
      email: 'test@example.com',
      token: expiredToken,
      expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
      used_at: null,
    });

    const { verifyMagicLink } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const { AuthError } = await import('../lib/errors.js');

    try {
      await verifyMagicLink(expiredToken);
      t.fail('Should have thrown an error');
    } catch (error) {
      t.ok(error instanceof AuthError, 'Should throw AuthError');
      t.match(
        (error as Error).message,
        /expired/,
        'Should indicate token expired'
      );
    }
  });

  await t.test('used token throws AuthError (single-use)', async (t: Test) => {
    magicLinks.clear();
    users.clear();

    const usedToken = 'used-token-123';
    magicLinks.set(usedToken, {
      id: 'ml_4',
      email: 'test@example.com',
      token: usedToken,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used_at: new Date().toISOString(), // Already used
    });

    const { verifyMagicLink } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const { AuthError } = await import('../lib/errors.js');

    try {
      await verifyMagicLink(usedToken);
      t.fail('Should have thrown an error');
    } catch (error) {
      t.ok(error instanceof AuthError, 'Should throw AuthError');
      t.match(
        (error as Error).message,
        /already been used/,
        'Should indicate token already used'
      );
    }
  });

  await t.test(
    'token is marked as used after verification',
    async (t: Test) => {
      magicLinks.clear();
      users.clear();

      const token = 'consume-token-123';
      magicLinks.set(token, {
        id: 'ml_5',
        email: 'test@example.com',
        token: token,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used_at: null,
      });

      const { verifyMagicLink } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      await verifyMagicLink(token);

      const updatedMagicLink = magicLinks.get(token);
      t.ok(
        updatedMagicLink?.used_at,
        'Token should be marked as used after verification'
      );
    }
  );

  await t.test(
    'new user API key hash is stored in database',
    async (t: Test) => {
      magicLinks.clear();
      users.clear();

      const token = 'hash-test-token';
      magicLinks.set(token, {
        id: 'ml_6',
        email: 'hashtest@example.com',
        token: token,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        used_at: null,
      });

      const { verifyMagicLink } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const result = await verifyMagicLink(token);

      const storedUser = users.get('hashtest@example.com');
      t.ok(storedUser, 'User should be stored');
      t.ok(storedUser?.api_key_hash, 'Hash should be stored');
      t.ok(storedUser?.api_key_prefix, 'Prefix should be stored');

      // Verify the stored hash matches the returned key
      const isValid = await bcrypt.compare(
        result.apiKey!,
        storedUser!.api_key_hash
      );
      t.ok(isValid, 'Stored hash should verify the returned API key');
    }
  );
});

test('validateApiKey', async (t: Test) => {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      api_key_hash: string;
      api_key_prefix: string;
      created_at: string;
      updated_at: string;
    }
  >();

  const createMockSupabase = () => ({
    from: (table: string) => {
      const baseQuery = {
        select: () => baseQuery,
        eq: (column: string, value: string) => {
          // Return array for api_key_prefix lookup
          if (table === 'users' && column === 'api_key_prefix') {
            const matchingUsers = Array.from(users.values()).filter(
              (u) => u.api_key_prefix === value
            );
            return Promise.resolve({
              data: matchingUsers,
              error: matchingUsers.length === 0 ? { code: 'PGRST116' } : null,
            });
          }
          const eqQuery = {
            ...baseQuery,
            single: async () => ({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          };
          return eqQuery;
        },
        single: async () => ({
          data: null,
          error: { code: 'PGRST116', message: 'not found' },
        }),
      };
      return baseQuery;
    },
  });

  await t.test('valid API key returns user', async (t: Test) => {
    users.clear();

    const apiKey = 'oc_validkey1234567890abcdef12345';
    const hash = await bcrypt.hash(apiKey, 10);
    const prefix = 'oc_validkey...';

    users.set('test@example.com', {
      id: 'user_1',
      email: 'test@example.com',
      api_key_hash: hash,
      api_key_prefix: prefix,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { validateApiKey } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const user = await validateApiKey(apiKey);

    t.ok(user, 'Should return user for valid API key');
    t.equal(user?.email, 'test@example.com', 'Should return correct user');
  });

  await t.test('invalid API key returns null', async (t: Test) => {
    users.clear();

    const { validateApiKey } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const user = await validateApiKey('oc_invalidkey12345678901234567');

    t.equal(user, null, 'Should return null for invalid API key');
  });

  await t.test(
    'API key without proper prefix returns null',
    async (t: Test) => {
      users.clear();

      const { validateApiKey } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const user = await validateApiKey('invalid_prefix_key');

      t.equal(user, null, 'Should return null for key without oc_ prefix');
    }
  );

  await t.test('empty API key returns null', async (t: Test) => {
    users.clear();

    const { validateApiKey } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const user = await validateApiKey('');

    t.equal(user, null, 'Should return null for empty API key');
  });

  await t.test('null/undefined API key returns null', async (t: Test) => {
    users.clear();

    const { validateApiKey } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    // @ts-expect-error testing invalid input
    const user1 = await validateApiKey(null);
    // @ts-expect-error testing invalid input
    const user2 = await validateApiKey(undefined);

    t.equal(user1, null, 'Should return null for null API key');
    t.equal(user2, null, 'Should return null for undefined API key');
  });

  await t.test(
    'wrong API key with matching prefix returns null',
    async (t: Test) => {
      users.clear();

      const realKey = 'oc_realkey01234567890abcdef12345';
      const fakeKey = 'oc_realkey09999999999999999999'; // Same prefix, different key
      const hash = await bcrypt.hash(realKey, 10);
      const prefix = 'oc_realkey0...';

      users.set('test@example.com', {
        id: 'user_1',
        email: 'test@example.com',
        api_key_hash: hash,
        api_key_prefix: prefix,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const { validateApiKey } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const user = await validateApiKey(fakeKey);

      t.equal(
        user,
        null,
        'Should return null when prefix matches but hash does not'
      );
    }
  );
});

test('refreshApiKey', async (t: Test) => {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      api_key_hash: string;
      api_key_prefix: string;
      created_at: string;
      updated_at: string;
    }
  >();

  const createMockSupabase = () => ({
    from: (table: string) => {
      const baseQuery = {
        select: () => baseQuery,
        update: (data: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            if (table === 'users' && column === 'id') {
              for (const [email, user] of users) {
                if (user.id === value) {
                  users.set(email, { ...user, ...data } as typeof user);
                }
              }
            }
            return Promise.resolve({ error: null });
          },
        }),
        eq: (column: string, value: string) => {
          if (table === 'users' && column === 'api_key_prefix') {
            const matchingUsers = Array.from(users.values()).filter(
              (u) => u.api_key_prefix === value
            );
            return Promise.resolve({
              data: matchingUsers,
              error: matchingUsers.length === 0 ? { code: 'PGRST116' } : null,
            });
          }
          const eqQuery = {
            ...baseQuery,
            single: async () => ({
              data: null,
              error: { code: 'PGRST116', message: 'not found' },
            }),
          };
          return eqQuery;
        },
        single: async () => ({
          data: null,
          error: { code: 'PGRST116', message: 'not found' },
        }),
      };
      return baseQuery;
    },
  });

  await t.test('returns new API key and prefix', async (t: Test) => {
    users.clear();

    const oldHash = await bcrypt.hash('oc_oldkey1234567890abcdef12345', 10);
    users.set('test@example.com', {
      id: 'user_1',
      email: 'test@example.com',
      api_key_hash: oldHash,
      api_key_prefix: 'oc_oldkey12...',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { refreshApiKey } = (await t.mockImport('./auth.js', {
      '../lib/supabase.js': {
        getSupabaseClient: createMockSupabase,
      },
      './email.js': { sendMagicLink: async () => {} },
    })) as typeof import('./auth.js');

    const result = await refreshApiKey('user_1');

    t.ok(result.apiKey, 'Should return a new API key');
    t.ok(
      result.apiKey.startsWith('oc_'),
      'New API key should have correct prefix'
    );
    t.equal(result.apiKey.length, 35, 'New API key should be 35 characters');
    t.ok(result.apiKeyPrefix, 'Should return a visible prefix');
    t.ok(
      result.apiKeyPrefix.endsWith('...'),
      'Visible prefix should end with ...'
    );
  });

  await t.test(
    'invalidates old key by updating user record with new hash',
    async (t: Test) => {
      users.clear();

      const oldHash = await bcrypt.hash('oc_oldkey1234567890abcdef12345', 10);
      const oldPrefix = 'oc_oldkey12...';
      users.set('test@example.com', {
        id: 'user_2',
        email: 'test@example.com',
        api_key_hash: oldHash,
        api_key_prefix: oldPrefix,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const { refreshApiKey } = (await t.mockImport('./auth.js', {
        '../lib/supabase.js': {
          getSupabaseClient: createMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      })) as typeof import('./auth.js');

      const result = await refreshApiKey('user_2');

      const updatedUser = users.get('test@example.com');
      t.not(updatedUser?.api_key_hash, oldHash, 'Hash should be updated');
      t.equal(
        updatedUser?.api_key_prefix,
        result.apiKeyPrefix,
        'Prefix should be updated'
      );

      // Verify the new hash matches the returned key
      const isValid = await bcrypt.compare(
        result.apiKey,
        updatedUser!.api_key_hash
      );
      t.ok(isValid, 'New hash should verify the returned API key');
    }
  );

  await t.test('throws error if database update fails', async (t: Test) => {
    const failingMockSupabase = {
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({ error: { message: 'Database error' } }),
        }),
      }),
    };

    const { refreshApiKey: failingRefreshApiKey } = (await t.mockImport(
      './auth.js',
      {
        '../lib/supabase.js': {
          getSupabaseClient: () => failingMockSupabase,
        },
        './email.js': { sendMagicLink: async () => {} },
      }
    )) as typeof import('./auth.js');

    await t.rejects(
      failingRefreshApiKey('user_1'),
      /Failed to refresh API key/,
      'Should throw error on database failure'
    );
  });
});
