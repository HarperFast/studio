import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';

export interface ExecuteParams<TInput = any> {
	input: TInput;
	instanceClientParams: InstanceClientIdConfig & InstanceTypeConfig;
	baseURL: string | null;
	params: Record<string, string>;
}
