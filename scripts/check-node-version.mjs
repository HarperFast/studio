import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isSupported(range, version) {
	const match = /^>=(\d+) <(\d+)$/.exec(range);
	if (!match) {
		throw new Error(`check-node-version can't parse engines.node "${range}" — update its parser`);
	}
	const [, low, high] = match;
	const major = Number(version.split('.')[0]);
	return major >= Number(low) && major < Number(high);
}

export default function checkNodeVersion() {
	const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
	const range = pkg.engines?.node;
	if (range && !isSupported(range, process.versions.node)) {
		throw new Error(
			`Unsupported Node.js version: running ${process.version}, studio requires node ${range} (see .nvmrc).`,
		);
	}
}
