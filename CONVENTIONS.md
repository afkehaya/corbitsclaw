# Faremeter Conventions

This project follows the faremeter-ts-playground conventions for TypeScript monorepo development.

## Project Structure

```
.
├── apps/           # Application packages (APIs, services)
├── packages/       # Shared library packages
├── scripts/        # Build and utility scripts
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── tsconfig.json
├── eslint.config.ts
└── Makefile
```

## Package Management

- **Package Manager**: pnpm (v10.12.1)
- **Workspace Mode**: Uses pnpm workspaces with catalog dependencies
- **Catalog Mode**: `prefer` - dependencies use catalog versions when available
- **Link Workspace Packages**: Enabled for local package resolution

### Catalog Dependencies

All shared dependencies are defined in `pnpm-workspace.yaml` under the `catalog` section. Packages should reference these using `"catalog:"` in their package.json:

```json
{
  "dependencies": {
    "hono": "catalog:"
  }
}
```

## TypeScript Configuration

### Base Configuration (`tsconfig.base.json`)

- Target: ESNext
- Module: ESNext with bundler resolution
- Strict mode enabled with additional checks:
  - `noUncheckedIndexedAccess`: Adds undefined to index signatures
  - `noImplicitOverride`: Requires override keyword
  - `exactOptionalPropertyTypes`: Distinguishes between undefined and missing
- Verbatim module syntax for explicit imports/exports
- Composite mode for project references

### Package Configuration

Each package should have its own `tsconfig.json` that:
1. Extends `../../tsconfig.base.json`
2. Specifies its own `include` patterns
3. References dependent packages

## Linting & Formatting

### ESLint

- Uses typescript-eslint with strict type checking
- Configuration in `eslint.config.ts`
- Ignores: node_modules, dist, JS files

### Prettier

- Default configuration
- Run via `pnpm prettier`

## Build Commands

All commands are run via Makefile:

```bash
make lint      # Run prettier check and eslint
make build     # Build all packages
make test      # Run all tests
make format    # Auto-format with prettier
make clean     # Remove build artifacts
make all       # lint + build + test
```

## Key Libraries

### Runtime
- **hono**: Web framework for APIs
- **@hono/node-server**: Node.js adapter for Hono
- **arktype**: Runtime type validation
- **dotenv**: Environment variable management

### Database & Services
- **@supabase/supabase-js**: Supabase client
- **stripe**: Payment processing
- **resend**: Email service

### Faremeter Packages
- **@faremeter/fetch**: HTTP client utilities
- **@faremeter/wallet-solana**: Solana wallet integration
- **@faremeter/payment-solana**: Solana payment processing
- **@faremeter/types**: Shared type definitions

### Development
- **tsx**: TypeScript execution
- **tap**: Testing framework
- **typescript**: TypeScript compiler
- **eslint**: Linting
- **prettier**: Code formatting

## Conventions

### File Naming
- TypeScript files: `kebab-case.ts`
- Test files: `*.test.ts` or `*.spec.ts`
- Configuration: `*.config.ts`

### Import/Export
- Use verbatim module syntax (`import type` for types)
- Prefer named exports over default exports
- Use explicit file extensions in imports when needed

### Error Handling
- Use arktype for runtime validation
- Prefer Result types over throwing for expected errors
- Use proper error types, not plain strings

### Testing
- Use tap testing framework
- Co-locate tests with source or in `__tests__` directory
- Name test files with `.test.ts` suffix
