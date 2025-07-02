import { fetch } from 'whatwg-fetch';

export default async ({ operation, auth, url, timeout = 0, authType = undefined, signal = undefined }) => {
	try {
		const controller = new AbortController();
		const id = setTimeout(() => (timeout ? controller.abort() : null), timeout);

		const headers = {
			'Content-Type': 'application/json',
		};
		if (authType === 'token') headers.Authorization = `Bearer ${auth.token}`;
		else if (auth?.pass) headers.Authorization = `Basic ${btoa(`${auth.user}:${auth.pass}`)}`;
		const request = await fetch(url, {
			signal: signal || controller.signal,
			method: 'POST',
			body: JSON.stringify(operation),
			headers,
			credentials: headers.Authorization ? 'omit' : 'include',
		});

		clearTimeout(id);

		const response = await request.json();

		if (response.error) {
			return {
				error: true,
				message: response.error,
				type: 'response',
				status: request.status,
				role_errors: response.main_permissions?.join(', '),
				access_errors: response.unauthorized_access?.map((e) => ({
					schema: e.schema,
					table: e.table,
					type: e.required_attribute_permissions?.length ? 'attribute' : 'table',
					entity: e.required_attribute_permissions?.length
						? e.required_attribute_permissions[0]?.attribute_name
						: e.table,
					permission: e.required_attribute_permissions?.length
						? e.required_attribute_permissions[0]?.required_permissions.join(', ')
						: e.required_table_permissions?.join(', '),
				})),
			};
		}

		if (request.status !== 200) {
			return {
				error: true,
				message: `Error of type ${request.status}`,
				type: 'status',
			};
		}

		return response;
	} catch (e) {
		return {
			error: true,
			message: e.message,
			type: 'catch',
		};
	}
};
