// @ts-ignore
import config from 'config-vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { mergeConfig } from 'vite';

export default mergeConfig(config(), {
	plugins: [svelteTesting()],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
	},
});
