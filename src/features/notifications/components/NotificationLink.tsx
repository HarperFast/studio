import { parseNotificationLink } from '@/features/notifications/notificationHelpers';
import { Link } from '@tanstack/react-router';
import { ExternalLinkIcon } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Renders a notification's optional deep link. External URLs (any scheme) open in a new tab as a plain
 * anchor; internal paths use the router `Link` so they resolve through the app's hash history. Renders
 * nothing when there's no usable link.
 */
export function NotificationLink({
	url,
	className,
	children,
	onNavigate,
}: {
	url: string | null | undefined;
	className?: string;
	children?: ReactNode;
	/** Called after an internal navigation, e.g. to close the containing dropdown. */
	onNavigate?: () => void;
}) {
	const link = parseNotificationLink(url);
	if (!link) { return null; }

	if (link.kind === 'external') {
		return (
			<a href={link.href} target="_blank" rel="noreferrer noopener" className={className}>
				{children ?? 'Learn more'}
				<ExternalLinkIcon className="inline size-3 ml-1 align-[-1px]" />
			</a>
		);
	}

	return (
		<Link to={link.href} className={className} onClick={onNavigate}>
			{children ?? 'View details'}
		</Link>
	);
}
