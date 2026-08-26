/**
 * @vitest-environment jsdom
 */
import { deployModes } from '@/config/constants';
import { stubDeployBuild } from '@/test/stubDeployBuild';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadGTMForMode(mode: string | undefined, telemetryEnabled: string | undefined) {
	vi.resetModules();
	stubDeployBuild({ mode, envName: mode, telemetryEnabled });
	return import('./gtm');
}

function renderGTM(useGTM: () => void) {
	function Harness() {
		useGTM();
		return null;
	}
	render(<Harness />);
}

function gtmScripts() {
	return [...document.querySelectorAll('script')].filter((script) => script.src.includes('googletagmanager.com'));
}

afterEach(() => {
	cleanup();
	document.head.innerHTML = '';
	document.body.innerHTML = '';
	vi.unstubAllEnvs();
});

describe('GTM loading guard', () => {
	it.each([...deployModes])('injects the tag from a %s deploy', async (mode) => {
		// The tag is inserted before an existing script, so the document needs one.
		document.head.append(document.createElement('script'));
		const { useGTM } = await loadGTMForMode(mode, 'true');

		renderGTM(useGTM);

		expect(gtmScripts()).toHaveLength(1);
	});

	// A bare `vite build` on localhost used to put developer click-throughs in customer analytics.
	it.each([undefined, '', 'production', 'localstudio', 'test'])('injects nothing in mode %o', async (mode) => {
		document.head.append(document.createElement('script'));
		const { useGTM } = await loadGTMForMode(mode, 'true');

		renderGTM(useGTM);

		expect(gtmScripts()).toHaveLength(0);
	});

	it('injects the tag once however many times the hook mounts', async () => {
		document.head.append(document.createElement('script'));
		const { useGTM } = await loadGTMForMode('prod', 'true');

		renderGTM(useGTM);
		cleanup();
		renderGTM(useGTM);

		expect(gtmScripts()).toHaveLength(1);
	});

	it.each([...deployModes])('injects nothing in a locally built %s bundle', async (mode) => {
		document.head.append(document.createElement('script'));
		const { useGTM } = await loadGTMForMode(mode, undefined);

		renderGTM(useGTM);

		expect(gtmScripts()).toHaveLength(0);
	});
});
