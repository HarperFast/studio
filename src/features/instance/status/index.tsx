import { isLocalStudio } from '@/config/constants';
import { CloudStatus } from '@/features/instance/status/CloudStatus';
import { LocalStatus } from '@/features/instance/status/LocalStatus';

export function StatusIndex() {
	return isLocalStudio ? <LocalStatus /> : <CloudStatus />;
}
