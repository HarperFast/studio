(function() {
	const anchor = document.getElementById('connectToHarperFabricAnchor');
	if (!anchor) {
		return;
	}
	anchor.setAttribute('href', calculateCreateClusterDeepLink());

	const container = document.getElementById('app-bg-color');
	if (!container) {
		return;
	}

	// Remove the centered single orb if present
	const existingCentered = container.querySelector('.orb-container');
	if (existingCentered) existingCentered.remove();

	const ORB_COUNT = 6;
	const MIN_SIZE = 120; // px
	const MAX_SIZE = 640; // px
	const FILL_DURATION = 15_000; // ms
	const REPLACE_EVERY = 15_000; // ms

	let addTimer = null;
	let replaceTimer = null;
	let createdCount = 0;

	window.addEventListener('beforeunload', beforeUnload);
	startStaggeredFill();

	function randomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function createOrb() {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const size = randomInt(MIN_SIZE, MAX_SIZE);
		const left = randomInt(0, Math.max(0, vw - size));
		const top = randomInt(0, Math.max(0, vh - size));

		const orb = document.createElement('div');
		orb.className = 'orb auto';
		orb.style.position = 'fixed';
		orb.style.width = size + 'px';
		orb.style.height = size + 'px';
		orb.style.left = left + 'px';
		orb.style.top = top + 'px';
		orb.style.animationDelay = (Math.random() * 15).toFixed(2) + 's';
		orb.style.pointerEvents = 'none';
		container.appendChild(orb);

		return orb;
	}

	function startStaggeredFill() {
		const interval = Math.max(150, Math.floor(FILL_DURATION / ORB_COUNT));
		addTimer = setInterval(executeStaggeredFillStep, interval);
	}

	function executeStaggeredFillStep() {
		createOrb();
		createdCount++;
		if (createdCount >= ORB_COUNT) {
			clearInterval(addTimer);
			addTimer = null;

			const orbsNow = container.querySelectorAll('.orb.auto');
			if (orbsNow.length > 0) {
				const idxNow = Math.floor(Math.random() * orbsNow.length);
				orbsNow[idxNow].remove();
				createOrb();
			}

			replaceTimer = setInterval(executeGentleRefreshCycle, REPLACE_EVERY);
		}
	}

	function executeGentleRefreshCycle() {
		const orbs = container.querySelectorAll('.orb.auto');
		if (orbs.length !== 0) {
			const idx = Math.floor(Math.random() * orbs.length);
			const toRemove = orbs[idx];
			toRemove.remove();
			createOrb();
		}
	}

	function beforeUnload() {
		if (addTimer) {
			clearInterval(addTimer);
		}
		if (replaceTimer) {
			clearInterval(replaceTimer);
		}
	}

	function calculateCreateClusterDeepLink() {
		// NOTE: This is also embedded in src/config/deepLinks.ts
		return 'https://fabric.harper.fast/#/?createCluster=' + encodeURIComponent(JSON.stringify({
			deploymentDescription: 'Self-Hosted',
			performanceDescription: 'Self Supported and Managed',
			instances: [
				{
					secure: String(location.protocol === 'https:'),
					fqdn: location.hostname,
					port: parseInt(location.port, 10),
				},
			],
		}));
	}
})();
