// NOTE: Did the best I can to match the original code style and structure and type it properly. Please review and adjust as necessary.

import { DescribeAllResponse } from '@/features/instance/operations/queries/getDescribeAll';
// Define the Structure type based on the usage in the function
type Structure = {
	[schema: string]: {
		[table: string]: {
			[key: string]: unknown;
			record_count: number;
			hashAttribute: string;
		};
	};
};

export function buildInstanceDataStructure(dbResponse: DescribeAllResponse): Structure {
	const structure: Structure = {};

	if (!dbResponse.error) {
		Object.keys(dbResponse)
			.sort()
			.forEach((schema) => {
				structure[schema] = {};
				Object.keys(dbResponse[schema])
					.sort()
					.forEach((table) => {
						structure[schema][table] = {
							record_count: dbResponse[schema][table].record_count,
							hashAttribute: dbResponse[schema][table].hash_attribute,
						};
					});
			});
	}

	return structure;
}
