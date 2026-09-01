import { spawnSync } from 'node:child_process';

const vitestArguments = process.argv.slice(2).filter((argument) => argument !== '--runInBand');
const result = spawnSync('vitest', ['run', ...vitestArguments], {
	stdio: 'inherit',
	shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
