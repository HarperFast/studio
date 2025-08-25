import { Loading } from '@/components/Loading';
import { SubNavMenu } from '@/components/SubNavMenu';

export function EditCluster() {
	return (
		<>
			<SubNavMenu />
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Loading className="mt-36" centered={true} text="Still setting this up..." />
			</div>
		</>
	);
}
