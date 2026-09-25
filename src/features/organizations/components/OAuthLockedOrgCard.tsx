import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOAuthSignInUrl } from '@/lib/urls/getOAuthSignInUrl';
import { Building2, KeyRoundIcon } from 'lucide-react';

export function OAuthLockedOrgCard({
	organizationId,
	organizationName,
	providers,
}: {
	organizationId: string;
	organizationName?: string;
	providers: Array<{ name: string; oauthConfigId: string }>;
}) {
	return (
		<Card className="relative gap-0 py-0 h-full justify-between overflow-hidden border border-amber-500/30">
			<CardHeader className="gap-4 py-5 border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/20 dark:from-primary/20 dark:to-primary/5">
				<div className="flex items-center justify-between gap-2">
					<span className="rounded-lg border border-primary/20 bg-background/50 p-2 text-primary dark:text-violet-300">
						<Building2 className="size-5" aria-hidden="true" />
					</span>
					<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs">
						Sign-in required
					</span>
				</div>
				<CardTitle>
					<h2 className="truncate text-xl" title={organizationName || organizationId}>
						{organizationName || organizationId}
					</h2>
				</CardTitle>
				{organizationName && organizationName !== organizationId && (
					<p className="truncate text-xs text-muted-foreground" title={organizationId}>{organizationId}</p>
				)}
			</CardHeader>
			<CardContent className="py-4 flex flex-col gap-2">
				<p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
					<KeyRoundIcon className="size-3 shrink-0" />
					Sign in with an OAuth provider to access this organization.
				</p>
				{providers.map((provider) => (
					<a key={provider.oauthConfigId} href={getOAuthSignInUrl(provider.oauthConfigId)}>
						<Button variant="outline" className="w-full">
							Sign in with {provider.name}
						</Button>
					</a>
				))}
			</CardContent>
		</Card>
	);
}
