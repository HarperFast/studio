// Coordinates follow the visible energy lines in each 2054 × 766 panoramic hero image.
// Keep separate traces: the light artwork has a different globe and platform position.
const energyPaths = {
	dark: [
		'M 246 426 C 211 389 184 377 154 386 C 72 399 44 492 0 576',
		'M 658 383 C 693 318 748 286 795 286 C 905 281 957 477 952 583',
		'M 750 438 C 915 444 1083 562 1183 766',
		'M 0 576 C 119 529 273 575 372 766',
		'M 1196 766 C 1291 526 1514 442 1690 432 C 1844 430 1973 530 2054 651',
	],
	light: [
		'M 258 355 C 212 300 171 289 136 313 C 74 352 37 434 0 542',
		'M 633 350 C 684 251 744 193 790 200 C 882 201 967 380 951 548',
		'M 756 405 C 891 368 1055 510 1169 766',
		'M 0 542 C 112 440 299 588 356 766',
		'M 1285 766 C 1391 564 1556 518 1710 505 C 1840 504 1971 571 2054 668',
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
