import './GitHubAuthenticationButton.css';
import { GithubIcon } from 'lucide-react';

export function GitHubAuthenticationButton({ text }: { text: 'Sign in with GitHub' | 'Sign up with GitHub' }) {
	return <a href="/oauth/github/login?redirect=%2F%23%2Fcheck-oauth">
		<button className="github-signin-btn">
			<GithubIcon className="github-icon" />
			{text}
		</button>
	</a>;
}
