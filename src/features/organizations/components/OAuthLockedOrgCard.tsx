import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOAuthSignInUrl } from '@/lib/urls/getOAuthSignInUrl';
import { KeyRoundIcon } from 'lucide-react';

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
		<Card className="relative h-full justify-between opacity-90">
			<CardHeader>
				<CardDescription className="truncate">{organizationId}</CardDescription>
				<CardTitle>
					<h2>{organizationName}</h2>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
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
