import { MainLogo } from '@/components/MainLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Version } from '@/components/Version';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { Link, Outlet } from '@tanstack/react-router';
import { BookOpenText, Box, Database, Mail, Zap } from 'lucide-react';
import { HeroParticles } from './components/HeroParticles';
import './AuthLayout.css';

const features = [
	{ title: 'App', description: 'Build faster', Icon: Box },
	{ title: 'Database', description: 'Store smarter', Icon: Database },
	{ title: 'Cache', description: 'Move quicker', Icon: Zap },
	{ title: 'Messaging', description: 'Stay connected', Icon: Mail },
];

export function AuthLayout() {
	const theme = useResolvedTheme();
	return (
		<div className="fabric-sign-in-page">
			<header className="sign-in-header">
				<div className="sign-in-brand">
					<Link to="/" aria-label="Harper Fabric home">
						<MainLogo />
					</Link>
					<Version />
				</div>
				<nav aria-label="Authentication navigation">
					<a className="sign-in-docs" href="https://docs.harperdb.io/docs" target="_blank" rel="noreferrer noopener">
						<BookOpenText aria-hidden="true" /> <span>Docs</span>
					</a>
					<ThemeToggle />
				</nav>
			</header>
			<main className="sign-in-content">
				<section className="sign-in-story" aria-labelledby="sign-in-story-title">
					<div className="sign-in-story-copy">
						<h2 id="sign-in-story-title">
							One runtime.<br />
							<span>Endless possibilities.</span>
						</h2>
						<p>
							Build, deploy, and scale distributed applications<br className="sign-in-desktop-break" />{' '}
							with built-in data, cache, and messaging.
						</p>
						<ul className="sign-in-features">
							{features.map(({ title, description, Icon }) => (
								<li key={title}>
									<span className="sign-in-feature-icon">
										<Icon aria-hidden="true" />
									</span>
									<strong>{title}</strong>
									<span>{description}</span>
								</li>
							))}
						</ul>
					</div>
					<div className="sign-in-artwork">
						<div className="auth-hero-panorama">
							<img
								src={`/auth/fabric-hero-${theme}-wide.png`}
								width="2054"
								height="766"
								alt="App, database, cache, and messaging together on a globally distributed platform."
								fetchPriority="high"
							/>
							<HeroParticles theme={theme} />
						</div>
					</div>
					<div className="sign-in-story-footer">
						<span>Free to deploy</span>
						<span aria-hidden="true" />
						<span>Live in minutes</span>
					</div>
				</section>
				<section className="sign-in-card" aria-label="Account access">
					<Outlet />
				</section>
			</main>
		</div>
	);
}
