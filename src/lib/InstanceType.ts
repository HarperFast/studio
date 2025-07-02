type InstanceTypes = 'typ-1' | 'typ-2' | 'typ-3';
const renderInstanceTypeOption = (typeId: InstanceTypes) => {
	switch (typeId) {
		case 'typ-1':
			return 'Self-Hosted';

		case 'typ-2':
			return 'Config 1';

		case 'typ-3':
			return 'Config 2';

		default:
			return 'N/A';
	}
};

export type { InstanceTypes };
export { renderInstanceTypeOption };
