/**
 * @vitest-environment jsdom
 */
import { ackNotification, unackNotification } from '@/features/notifications/acks';
import { getLocalStorage } from '@/lib/storage/getLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { beforeEach, describe, expect, it } from 'vitest';

const read = () => getLocalStorage<string[]>(LocalStorageKeys.AckedNotificationIds, []);

describe('notification acks', () => {
	beforeEach(() => localStorage.clear());

	it('adds an id and persists it to localStorage', () => {
		ackNotification('sta-1');
		expect(read()).toEqual(['sta-1']);
	});

	it('dedupes repeated acks of the same id', () => {
		ackNotification('sta-1');
		ackNotification('sta-1');
		expect(read()).toEqual(['sta-1']);
	});

	it('removes an id on unack while leaving others intact', () => {
		ackNotification('sta-1');
		ackNotification('sta-2');
		unackNotification('sta-1');
		expect(read()).toEqual(['sta-2']);
	});
});
