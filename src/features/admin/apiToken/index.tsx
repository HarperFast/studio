import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useGenerateApiTokenMutation } from '@/features/admin/apiToken/mutations/useGenerateApiToken';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { ApiTokenResult } from '@/integrations/api/api.patch';
import { CopyIcon, KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';

export function ApiTokenIndex() {
	const { mutate, isPending, reset } = useGenerateApiTokenMutation();
	const [token, setToken] = useState<ApiTokenResult | null>(null);
	const copyText = useCopyTextToClipboard();

	const onGenerate = () => {
		// The global MutationCache.onError (react-query/queryClient) already surfaces
		// failures with a toast, so no local onError.
		mutate(undefined, {
			onSuccess: (result) => {
				// Hold the credential in local component state only, then drop it from
				// the shared MutationCache so it can't be read there or outlive the page.
				setToken(result);
				reset();
			},
		});
	};

	return (
		<div className="max-w-2xl">
			<h1 className="text-2xl font-light">API Token</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Generate a short-lived token for programmatic API access. It authenticates as you, with your permissions. Send
				it as a bearer token:{' '}
				<code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer &lt;token&gt;</code>
			</p>

			<Button className="mt-4" variant="submit" onClick={onGenerate} disabled={isPending}>
				<KeyRoundIcon />
				{isPending ? 'Generating…' : 'Generate token'}
			</Button>

			{token && (
				<Card className="mt-6">
					<CardHeader>
						<CardTitle>Your API token</CardTitle>
						<CardDescription>
							Copy it now — it won't be shown again. Expires {new Date(token.expiresAt).toLocaleString()}.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex items-center gap-2">
						<Input
							readOnly
							value={token.operationToken}
							className="font-mono text-xs"
							onClick={() => copyText(token.operationToken)}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="shrink-0"
							aria-label="Copy token"
							onClick={() => copyText(token.operationToken)}
						>
							<CopyIcon />
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
