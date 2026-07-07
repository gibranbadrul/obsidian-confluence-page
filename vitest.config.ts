import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		include: ['tests/**/*.test.ts'],
	},
	resolve: {
		alias: {
			obsidian: resolve(__dirname, 'tests/helpers/obsidian.ts'),
		},
	},
});
