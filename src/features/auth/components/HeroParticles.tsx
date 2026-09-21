// Coordinates follow the visible energy lines in each 2054 × 766 panoramic hero image.
// Keep separate traces: the light artwork has a different globe and platform position.
const energyPaths = {
	dark: [
		'M 246 426 C 205 378 154 362 108 404 C 58 456 27 520 0 575',
		'M 655 359 C 695 293 744 277 795 286 C 888 292 970 480 952 583',
		'M 750 440 C 921 423 1086 558 1186 766',
		'M 0 576 C 127 493 279 590 372 766',
		'M 1196 766 C 1300 560 1505 432 1690 432 C 1845 432 1965 536 2054 640',
	],
	light: [
		'M 258 355 C 212 300 171 289 136 313 C 74 352 37 434 0 542',
		'M 633 350 C 663 272 733 199 790 202 C 879 193 962 375 951 539',
		'M 756 405 C 885 367 1057 486 1164 766',
		'M 0 542 C 112 442 285 590 356 766',
		'M 1285 766 C 1425 580 1550 505 1710 505 C 1840 505 1970 572 2054 668',
	],
};

const particles = [
	{ path: 0, duration: 12, phase: 3 },
	{ path: 1, duration: 16, phase: 6 },
	{ path: 1, duration: 16, phase: 14 },
	{ path: 2, duration: 14, phase: 4 },
	{ path: 3, duration: 18, phase: 11 },
	{ path: 4, duration: 22, phase: 5 },
	{ path: 4, duration: 22, phase: 16 },
];

/** Decorative native SVG motion scales with the artwork, without a JS animation loop. */
export function HeroParticles({ theme }: { theme: 'light' | 'dark' }) {
	return (
		<svg className="auth-energy-particles" viewBox="0 0 2054 766" aria-hidden="true" focusable="false">
			{particles.map(({ path, duration, phase }, index) => (
				<g key={`${theme}-${index}`} className="auth-energy-particle" opacity="0">
					<circle r="12" fill="currentColor" opacity="0.06" />
					<circle r="6" fill="currentColor" opacity="0.16" />
					<circle r="2.2" fill="currentColor" />
					<animateMotion
						path={energyPaths[theme][path]}
						dur={`${duration}s`}
						begin={`-${phase}s`}
						repeatCount="indefinite"
					/>
					<animate
						attributeName="opacity"
						values="0;0.85;0.85;0"
						keyTimes="0;0.12;0.82;1"
						dur={`${duration}s`}
						begin={`-${phase}s`}
						repeatCount="indefinite"
					/>
				</g>
			))}
		</svg>
	);
}
