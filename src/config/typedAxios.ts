/* eslint-disable @typescript-eslint/no-explicit-any */
import type { paths } from '@/integrations/api/api.gen';
import type { Axios, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface TypedAxios extends Axios {
	get<
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['get']>,
	>(url: U, config?: TypedAxiosRequestConfig<Q, never>): Promise<R>;

	delete<
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['delete']>,
	>(url: U, config?: TypedAxiosRequestConfig<Q, never>): Promise<R>;

	head<
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['head']>,
	>(url: U, config?: TypedAxiosRequestConfig<Q, never>): Promise<R>;

	options<
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['options']>,
	>(url: U, config?: TypedAxiosRequestConfig<Q, never>): Promise<R>;

	post<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['post']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;

	put<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['put']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;

	patch<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['patch']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;

	postForm<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['post']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;

	putForm<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['put']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;

	patchForm<
		B = unknown,
		Q = unknown,
		U extends keyof paths = any,
		R = ResponseType<paths[U]['patch']>,
	>(url: U, body?: B, config?: TypedAxiosRequestConfig<Q, B>): Promise<R>;
}

type ResponseType<R extends SuccessResponse | EmptySuccessResponse | EmptyResponse | undefined> = AxiosResponse<
	R extends SuccessResponse ? R['responses']['200']['content']['application/json']
		: R extends EmptyResponse | EmptySuccessResponse ? null
		: unknown
>;

interface SuccessResponse {
	responses: {
		'200': {
			content: {
				'application/json': unknown;
			};
		};
	};
}

interface EmptySuccessResponse {
	responses: {
		'200': {
			content?: never;
		};
	};
}

interface EmptyResponse {
	responses: {
		'204': {
			content?: never;
		};
	};
}

interface TypedAxiosRequestConfig<Q = unknown, B = unknown> extends AxiosRequestConfig<B> {
	params?: Q;
	data?: B;
}
