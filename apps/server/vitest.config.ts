import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { env: { DB_FILE: ':memory:', BOT_TOKEN: '' }, pool: 'forks' } });
