import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TriangleAlertIcon } from 'lucide-react';

const SECURITY_MODEL_URL = 'https://github.com/HarperFast/harper/issues/3042';

/** Both from the security model in harper#3042. */
export function PreviewWarnings({ shared }: { shared?: boolean }) {
	return (
		<>
			{shared && <SharedDataWarning />}
			<Alert variant="warning">
				<TriangleAlertIcon />
				<AlertTitle>Previews are the same site as production</AlertTitle>
				<AlertDescription>
					<p>
						A preview is the same site as what production serves from the cluster's host name, so it can set cookies
						production receives, and SameSite does not separate them. What production serves only from a custom domain
						is a different site.{' '}
						<a className="underline" href={SECURITY_MODEL_URL} target="_blank" rel="noreferrer">
							Security model
						</a>
					</p>
				</AlertDescription>
			</Alert>
		</>
	);
}

export function SharedDataWarning() {
	return (
		<Alert variant="warning">
			<TriangleAlertIcon />
			<AlertTitle>Previews share this cluster's data</AlertTitle>
			<AlertDescription>
				<p>A preview's writes, schema changes and roles apply to the cluster's databases.</p>
			</AlertDescription>
		</Alert>
	);
}
