// The one tinted status-banner surface for status analytics — a colored
// left border over a translucent tint of the same token. Shared like
// tooltipStyle.ts so the copies can't drift (they did, in PR #1497).
// Fallbacks matter: these banners can render outside index.css scope
// (chart-export capture, isolated test DOMs), where an unresolvable var()
// inside color-mix invalidates the whole background declaration.

function bannerStyle(tokenVar: string, fallback: string, mixPercent: number) {
	return {
		marginBottom: 8,
		padding: '4px 8px',
		fontSize: 12,
		borderLeft: `3px solid var(${tokenVar}, ${fallback})`,
		background: `color-mix(in srgb, var(${tokenVar}, ${fallback}) ${mixPercent}%, transparent)`,
		color: 'currentColor',
	} as const;
}

export const warningBannerStyle = bannerStyle('--color-warning', '#f59e0b', 12);
export const infoBannerStyle = bannerStyle('--color-info', '#3b82f6', 10);
