import { main as sharedMain } from 'config-storybook';
import { mergeConfig } from 'vite';

const config = {
	...sharedMain,
	stories: ['../src/**/*.stories.svelte'],
	viteFinal: async (viteConfig) =>
		mergeConfig(viteConfig, {
			build: {
				chunkSizeWarningLimit: 1000,
			},
		}),
} satisfies typeof sharedMain;

export default config;
