# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Node.js source. Entry is `src/app.js`; core logic in `src/SimplifiedMicromanager.js`; helpers in `src/utils/` (`DeviceInitializer.js`, `Logger.js`).
- `tests/`: Jest tests with `unit/`, `integration/`, and `mocks/` (e.g., `tests/mocks/serialport.js`). Global setup in `tests/setup.js`.
- `scripts/`: Operational helpers (e.g., `mock-serial-data.js`, service installers, test utilities).
- `transaction-logs/`: Local JSON backups generated at runtime; contents are git‑ignored.
- Config: Runtime config created by `DeviceInitializer` (e.g., `config/device.json`) using `.env` values.

## Build, Test, and Development Commands
- `npm run dev`: Start with nodemon for local development.
- `npm start`: Start the app in Node (production-like).
- `npm test`: Run Jest test suite; reports to `coverage/`.
- `npm run test:watch`: Watch mode for tests.
- `npm run lint`: ESLint over `src/`.
- `npm run demo` / `npm run mock-data`: Send example/mock serial data.
- `npm run setup` / `npm run welcome`: First‑run helpers; prints environment/setup hints.

## Coding Style & Naming Conventions
- Language: Node.js 18+, CommonJS (`require/module.exports`).
- Style: ESLint “recommended” rules (`.eslintrc.json`); 2‑space indentation; use semicolons; single quotes preferred.
- Naming: Classes/files in PascalCase (e.g., `SimplifiedMicromanager.js`); functions/variables in camelCase; constants in UPPER_SNAKE_CASE.
- Logs: Use `src/utils/Logger.js` (Winston) instead of `console.*` in app code.

## Testing Guidelines
- Framework: Jest (`jest.config.js`). Tests match `**/?(*.)+(spec|test).js` under `src/` or `tests/`.
- Structure: Unit tests in `tests/unit/`; integration in `tests/integration/`. Mocks in `tests/mocks/` (serial port is auto‑mocked via `moduleNameMapper`).
- Setup: `tests/setup.js` sets `.env.test` and sane defaults. Generate coverage with `npm test`.
- Examples: `npm test -- SimplifiedMicromanager` runs matching test files.

## Commit & Pull Request Guidelines
- Commits: Keep concise, imperative (e.g., "fix:", "feat:", "chore:" where helpful). Group related changes; include rationale when behavior changes.
- PRs: Provide description, motivation, and test notes; link related issues; attach logs/screenshots when relevant (e.g., health checks, webhook responses). Ensure `npm test` and `npm run lint` pass and that coverage does not regress.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` to `.env` and edit locally.
- Transaction backups in `transaction-logs/` are ignored by git; retain 30 days via built‑in cleanup.
- Validate webhook connectivity with `scripts/test-n8n-connection.js` before production runs.
