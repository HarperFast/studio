import { describe, expect, it } from 'vitest';
import { initialsOf } from './StaffUserCell';

describe('initialsOf', () => {
	it('takes the first letters of the names, else the address', () => {
		expect(initialsOf({ id: 'u', email: 'dawn@harperdb.io', firstname: 'Dawn', lastname: 'Toth' })).toBe('DT');
		expect(initialsOf({ id: 'u', email: 'dawn@harperdb.io', firstname: 'Dawn', lastname: '' })).toBe('D');
		expect(initialsOf({ id: 'u', email: 'ops@harperdb.io', firstname: '', lastname: '' })).toBe('O');
	});
});
