import { ErrorComponent } from '@/components/ErrorComponent';
import { errorStatus } from '@/lib/errorStatus';

/**
 * Central manager refuses a non-member with 403 before it looks the id up, so for anyone but staff a
 * missing organization and someone else's read the same — the copy must not confirm which. Only staff,
 * who skip that check, can get a 404.
 */
export function OrgRouteError({ error }: { error: unknown }) {
	switch (errorStatus(error)) {
		case 403:
			return (
				<ErrorComponent
					error={error}
					title="No Access to This Organization"
					description="This organization doesn't exist, or your account isn't a member of it. To join it, ask one of its administrators to invite you."
				/>
			);
		case 404:
			return (
				<ErrorComponent
					error={error}
					title="Organization Not Found"
					description="No organization has this ID. Check that the link is complete and correct."
				/>
			);
		default:
			return <ErrorComponent error={error} />;
	}
}
