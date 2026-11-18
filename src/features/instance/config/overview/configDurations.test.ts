import { describe, expect, it } from 'vitest';
import { describeConfigDuration, withDurationWords } from './configDurations';

const words = (path: string, value: unknown) => describeConfigDuration(path.split('.'), value)?.words;

describe('describeConfigDuration, for settings Harper reads with convertToMS', () => {
	it.each([
		['3d', '3 days'],
		['1D', '1 day'],
		['6H', '6 hours'],
		['30m', '30 minutes'],
		['1M', '1 month'],
		['2y', '2 years'],
		['1.5d', '1.5 days'],
		['45', '45 seconds'],
		[90, '90 seconds'],
	])('reads %s as %s', (value, expected) => {
		expect(words('logging.rotation.retention', value)).toBe(expected);
	});

	it('reads a unit it does not know as seconds, the way Harper does', () => {
		expect(words('logging.auditRetention', '3 days')).toBe('3 seconds');
		expect(words('logging.auditRetention', '2w')).toBe('2 seconds');
	});

	it("says when Harper can't read it at all", () => {
		expect(describeConfigDuration(['logging', 'rotation', 'interval'], 'daily')).toEqual({});
	});
});

describe('describeConfigDuration, for the token timeouts Harper hands to jsonwebtoken', () => {
	it.each([
		['1d', '1 day'],
		['30d', '30 days'],
		['10h', '10 hours'],
		['15m', '15 minutes'],
		['15M', '15 minutes'],
		['2 weeks', '2 weeks'],
		['1 hr', '1 hour'],
		['500ms', '500 milliseconds'],
		['1y', '1 year'],
		// set_configuration casts a numeric string to a number, and jsonwebtoken takes a number as seconds.
		['60', '60 seconds'],
		['.5', '0.5 seconds'],
		['1e3', '1000 seconds'],
		[3600, '3600 seconds'],
	])('reads %s as %s', (value, expected) => {
		expect(words('authentication.operationTokenTimeout', value)).toBe(expected);
	});

	it("says when jsonwebtoken can't read it", () => {
		expect(describeConfigDuration(['authentication', 'refreshTokenTimeout'], 'a month')).toEqual({});
		expect(describeConfigDuration(['authentication', 'refreshTokenTimeout'], '')).toEqual({});
	});
});

describe('describeConfigDuration elsewhere', () => {
	it('says nothing for a setting that is not a duration, or one that is unset', () => {
		expect(describeConfigDuration(['logging', 'level'], '3d')).toBeUndefined();
		expect(describeConfigDuration(['logging', 'auditRetention'], undefined)).toBeUndefined();
		expect(describeConfigDuration(['logging', 'rotation', 'interval'], null)).toBeUndefined();
	});
});

describe('withDurationWords', () => {
	it('adds the words after the value, only for a duration', () => {
		expect(withDurationWords(['logging', 'auditRetention'], '3d', '3d')).toBe('3d (3 days)');
		expect(withDurationWords(['logging', 'level'], 'warn', 'warn')).toBe('warn');
		expect(withDurationWords(['logging', 'auditRetention'], 'soon', 'soon')).toBe('soon');
	});
});
