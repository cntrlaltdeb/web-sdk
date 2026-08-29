import eslintConfigPrettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const chefBattleFiles = ['apps/chef-battle/src/**/*.{js,ts,svelte}'];

export default [
	{
		ignores: ['**/build/**', '**/dist/**', '**/.svelte-kit/**'],
	},
	...tseslint.configs['flat/recommended'],
	...svelte.configs.recommended,
	{
		files: chefBattleFiles,
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ['apps/chef-battle/src/**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
			},
		},
	},
	{
		files: ['apps/chef-battle/src/**/*.svelte.ts'],
		languageOptions: {
			parser: tsParser,
		},
	},
	eslintConfigPrettier,
];
