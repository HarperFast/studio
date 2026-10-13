import { forgetSessionValues } from '@/lib/storage/sessionStorageStore';

export function clearSessionStorage(): void {
	try {
		sessionStorage.clear();
	} finally {
		forgetSessionValues();
	}
}
