import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';

export function VerifyDomainOwnership(
	{ domain: { challengeToken, challengeTxtRecord } }: { domain: SchemaOrganizationDomain },
) {
	return (
		<div className="grid gap-2 grid-cols-1 md:grid-cols-[80px_1fr] pb-6">
			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Prove that you own this domain by adding the following to your DNS registrar:
			</div>

			<div className="col-span-1">Type:</div>
			<div className="col-span-1">TXT</div>

			<div className="col-span-1">Name:</div>
			<div className="col-span-1">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="challengeName"
					value={challengeTxtRecord}
				/>
			</div>

			<div className="col-span-1">TTL:</div>
			<div className="col-span-1">Auto</div>

			<div className="col-span-1">Content:</div>
			<div className="col-span-1">
				<input
					className="py-1 px-3 bg-gray-700 rounded-md w-full"
					type="text"
					readOnly={true}
					name="challengeToken"
					value={challengeToken}
				/>
			</div>

			<div className="text-muted-foreground md:col-span-2 text-wrap">
				Then after your DNS TTL elapses, click the "Validate" button above.
			</div>
		</div>
	);
}
