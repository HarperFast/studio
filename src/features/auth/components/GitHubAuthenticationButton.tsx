import './GitHubAuthenticationButton.css';
import { cx } from 'class-variance-authority';
import { GithubIcon } from 'lucide-react';
import { MouseEventHandler } from 'react';

export function GitHubAuthenticationButton({
	text,
	disabled,
	onClick,
}: {
	text: 'Sign in with GitHub' | 'Sign up with GitHub';
	disabled?: boolean;
	onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
	return (
		<a href="/oauth/github/login?redirect=%2F%23%2Fcheck-oauth" onClick={onClick}>
			<button
				className={cx('github-signin-btn', disabled && 'opacity-50')}
				type="button"
			>
				<GithubIcon className="github-icon" />
				{text}
			</button>
		</a>
	);
}
