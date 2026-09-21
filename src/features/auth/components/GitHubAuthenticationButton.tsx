import './GitHubAuthenticationButton.css';
import { checkOAuthRedirect, getOAuthSignInUrl } from '@/lib/urls/getOAuthSignInUrl';
import { cx } from 'class-variance-authority';
import { MouseEventHandler } from 'react';
import { LastUsedBadge } from './LastUsedBadge';

export function GitHubAuthenticationButton({
	text,
	disabled,
	onClick,
	lastUsed = false,
}: {
	text: 'Sign in with GitHub' | 'Sign up with GitHub';
	disabled?: boolean;
	onClick?: MouseEventHandler<HTMLAnchorElement>;
	lastUsed?: boolean;
}) {
	const button = (
		<a
			// Dropping the href is what actually disables the link: the sign-up page gates these on
			// accepting the terms, and its handler's preventDefault only covers a plain click —
			// middle-click and "open in new tab" would still reach the OAuth endpoint. `role`/`tabIndex`
			// keep the hrefless anchor in the tab order and announced, per the pattern in NodeLegend.
			href={disabled ? undefined : getOAuthSignInUrl('github', checkOAuthRedirect)}
			role={disabled ? 'link' : undefined}
			tabIndex={disabled ? 0 : undefined}
			onClick={onClick}
			aria-disabled={disabled || undefined}
			className={cx('github-signin-btn', disabled && 'opacity-50 cursor-default')}
		>
			<img src="/github/GitHub_Invertocat_White.svg" alt="" className="github-icon" />
			{text}
		</a>
	);

	if (!lastUsed) {
		return button;
	}

	// `flex flex-col` keeps the anchor block-level and full width, matching its original
	// flex-parent context on the sign-in page.
	return (
		<div className="relative flex flex-col">
			{button}
			<LastUsedBadge />
		</div>
	);
}
