import './GitHubAuthenticationButton.css';
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
			href="/oauth/github/login?redirect=%2F%23%2Fcheck-oauth"
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
