import { fileURLToPath } from 'node:url';

// Integration schemas must reflect the application they boot, including financial views.
// Suites testing a particular migration upgrade retain their explicit before/after setup.
export const currentMigrations = [fileURLToPath(new URL('../dist/migrations/*.js', import.meta.url))];
