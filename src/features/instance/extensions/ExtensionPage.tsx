import { Badge } from '@/components/ui/badge';
import { SectionsContent } from '@/features/instance/extensions/content/SectionsContent';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import type { ResolvedExtensionPage } from '@/features/instance/extensions/manifest';
import {
	PlacedExtensionPage,
	useExtensionDataSource,
	useExtensionPages,
	useExtensionPermission,
} from '@/features/instance/extensions/useStudioExtensions';
import { cn } from '@/lib/cn';
import { useParams } from '@tanstack/react-router';
import { LockIcon, PackageXIcon } from 'lucide-react';

/** The route body for a component's page, in either placement. */
export function ExtensionPage({ placement }: { placement: ResolvedExtensionPage['placement'] }) {
	const { extensionKey }: { extensionKey?: string } = useParams({ strict: false });
	const pages = useExtensionPages();
	const page = pages.find((candidate) => candidate.key === extensionKey && candidate.placement === placement);

	return (
		<div className={cn(placement === 'tab' && 'px-4 md:px-12 py-6')}>
			{!page
				? (
					<Unavailable
						icon={<PackageXIcon />}
						title="No component on this cluster provides this page"
						body="It may have been removed or renamed in a later deploy."
					/>
				)
				: !page.verdict.allowed
				? (
					<Unavailable
						icon={<LockIcon />}
						title={`${page.name} isn't available to your role`}
						body={`It needs ${page.verdict.missing.join(', ')}.`}
					/>
				)
				: <AllowedExtensionPage page={page} />}
		</div>
	);
}

function AllowedExtensionPage({ page }: { page: PlacedExtensionPage }) {
	const dataSource = useExtensionDataSource(page);
	const permission = useExtensionPermission();

	return (
		<>
			<header className="flex items-start gap-3 mb-6">
				<ExtensionIcon name={page.icon} className="size-7 mt-0.5 text-primary dark:text-white" />
				<div className="grow">
					<h1 className="text-xl font-semibold">{page.name}</h1>
					{page.description && <p className="text-sm text-muted-foreground">{page.description}</p>}
				</div>
				<Badge variant="outline" title="The component that added this page">{page.component}</Badge>
			</header>
			<SectionsContent
				sections={page.content.sections}
				dataSource={dataSource}
				permission={permission}
				access={page.access}
			/>
		</>
	);
}

function Unavailable({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
	return (
		<div className="flex flex-col items-center justify-center text-center gap-2 py-24 text-muted-foreground">
			<div className="[&_svg]:size-10">{icon}</div>
			<h1 className="text-lg font-semibold text-foreground">{title}</h1>
			<p className="text-sm">{body}</p>
		</div>
	);
}
