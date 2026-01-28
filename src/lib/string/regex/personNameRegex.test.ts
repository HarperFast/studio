import { describe, expect, it } from 'vitest';
import { personNameRegex } from './personNameRegex';

describe('personNameRegex', () => {
	it('should match valid names', () => {
		const validNames = [
			'John Doe',
			'Jane Smith',
			'Anne-Marie',
			"O'Connor",
			'François',
			'Müller',
			'Łukasz',
			'José',
			'María-José',
			'Åse',
			'Øyvind',
			'Æthelred',
			'ßert',
			'Česlav',
		];

		for (const name of validNames) {
			expect(name).toMatch(personNameRegex);
		}
	});

	it('should not match deceptive names (URLs)', () => {
		const deceptiveNames = [
			'https://hacker.com/give-me-your-money',
			'http://malicious.site',
			'www.google.com',
			'hacker.com',
		];

		for (const name of deceptiveNames) {
			expect(name).not.toMatch(personNameRegex);
		}
	});

	it('should not match strings with invalid characters', () => {
		const invalidNames = [
			'John Doe 123',
			'John! Doe',
			'John@Doe',
			'John#Doe',
			'John$Doe',
			'John%Doe',
			'John^Doe',
			'John&Doe',
			'John*Doe',
			'John(Doe)',
			'John+Doe',
			'John=Doe',
			'John{Doe}',
			'John}Doe',
			'John[Doe]',
			'John]Doe',
			'John|Doe',
			'John\\Doe',
			'John;Doe',
			'John:Doe',
			'John"Doe',
			'John<Doe>',
			'John.Doe',
			'John/Doe',
			'John?Doe',
		];

		for (const name of invalidNames) {
			expect(name).not.toMatch(personNameRegex);
		}
	});

	it('should match strings that are only special characters', () => {
		// We are stopping attack vectors, not bad data entry.
		const invalidNames = [
			' ',
			',',
			'-',
			"'",
			' ,',
			'- -',
			',,,',
		];

		for (const name of invalidNames) {
			expect(name).toMatch(personNameRegex);
		}
	});

	it('should match names with spaces, hyphens, and quotes', () => {
		const names = [
			'John Doe',
			'Anne-Marie',
			"O'Connor",
			'Doe, John',
			'  John  ', // Regex allows spaces, though SignUp.tsx trims them
		];

		for (const name of names) {
			expect(name).toMatch(personNameRegex);
		}
	});

	it('should not match empty string', () => {
		expect('').not.toMatch(personNameRegex);
	});
});
