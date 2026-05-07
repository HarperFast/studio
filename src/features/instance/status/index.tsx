import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient.tsx';
import { StatusTabs } from '@/features/instance/status/analytics/StatusTabs.tsx';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { Monitoring } from '@/features/instance/status/components/Monitoring.tsx';
import { LocalStatus } from '@/features/instance/status/LocalStatus';

function LegacyStatus({ instanceParams }: { instanceParams: ReturnType<typeof useInstanceClientIdParams> }) {
	return (
		<div className="px-4 py-2 flex flex-col">
			<div className="mb-12">
				<Monitoring instanceParams={instanceParams} />
			</div>
			{isLocalStudio
				? <LocalStatus instanceParams={instanceParams} />
				: <CloudStatus instanceParams={instanceParams} />}
		</div>
	);
}

export function StatusIndex() {
	const instanceParams = useInstanceClientIdParams();

	// `?legacyStatus=1` is a manual escape hatch — kept for one release in
	// case the redesign breaks for a particular customer. Auto-fallback on
	// instances where get_analytics is unavailable should ideally be done
	// inside StatusTabs itself via useAnalyticsCapability; the manual flag
	// here is the user-facing rollback.
	const useLegacy = typeof window !== 'undefined'
		&& new URLSearchParams(window.location.search).get('legacyStatus') === '1';

	if (useLegacy) {
		return <LegacyStatus instanceParams={instanceParams} />;
	}

	return (
		<StatusTabs
			instanceParams={instanceParams}
			isLocalStudio={isLocalStudio}
			renderFallback={() => <LegacyStatus instanceParams={instanceParams} />}
		/>
	);
}
