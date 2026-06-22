// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleAuthenticationButton } from './GoogleAuthenticationButton';

afterEach(() => cleanup());

describe('GoogleAuthenticationButton', () => {
	it('shows the "Last used" badge when lastUsed is set', () => {
		render(<GoogleAuthenticationButton text="Sign in with Google" lastUsed />);
		expect(screen.getByText('Last used')).toBeTruthy();
		expect(screen.getByRole('link')).toBeTruthy();
	});

	it('omits the badge by default', () => {
		render(<GoogleAuthenticationButton text="Sign in with Google" />);
		expect(screen.queryByText('Last used')).toBeNull();
	});
});
