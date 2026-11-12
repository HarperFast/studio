import { describe, expect, it } from 'vitest';
import {
	harperLoginKey,
	harperMcpArgs,
	localMcpHost,
	mcpAddress,
	mcpClientConfig,
	mcpHostForInstance,
	signInCoversApplication,
} from './mcpConnection';

const instance = {
	id: 'ins-1',
	name: 'us-east',
	instanceFqdn: 'node-1.example.harperfabric.com',
	operationsApiPort: 9925,
	operationsApiSecure: true,
};

describe('mcpHostForInstance', () => {
	it("puts the operations part on the instance's operations address and the application part on 443", () => {
		const host = mcpHostForInstance(instance);
		expect(host).toEqual({
			id: 'ins-1',
			label: 'us-east',
			operationsOrigin: 'https://node-1.example.harperfabric.com:9925',
			applicationOrigin: 'https://node-1.example.harperfabric.com',
		});
		expect(mcpAddress(host.operationsOrigin!, '/mcp')).toBe('https://node-1.example.harperfabric.com:9925/mcp');
		expect(mcpAddress(host.applicationOrigin!, '/mcp')).toBe('https://node-1.example.harperfabric.com/mcp');
	});

	it('has no address for an instance without one', () => {
		expect(mcpHostForInstance({ ...instance, instanceFqdn: undefined })).toMatchObject({
			operationsOrigin: null,
			applicationOrigin: null,
		});
	});
});

describe('localMcpHost', () => {
	it("puts the application part on the configuration's secure HTTP port when there is one", () => {
		expect(localMcpHost('http://localhost:9925', { port: 9926, securePort: 9927 })).toMatchObject({
			operationsOrigin: 'http://localhost:9925',
			applicationOrigin: 'https://localhost:9927',
		});
		expect(localMcpHost('http://localhost:9925', { port: 9926, securePort: null }).applicationOrigin).toBe(
			'http://localhost:9926',
		);
	});
});

describe('harper login keys', () => {
	it("keys a target the way Harper's normalizeTarget does", () => {
		expect(harperLoginKey('https://node.example.com')).toBe('https://node.example.com:9925/');
		expect(harperLoginKey('node.example.com')).toBe('https://node.example.com:9925/');
		expect(harperLoginKey('https://node.example.com:9925')).toBe('https://node.example.com:9925/');
		expect(harperLoginKey('https://node.example.com:443')).toBe('https://node.example.com:443/');
		expect(harperLoginKey('http://localhost:9926')).toBe('http://localhost:9926/');
	});

	it("lets the operations sign-in cover Fabric's application address, but not one on its own port", () => {
		expect(signInCoversApplication(mcpHostForInstance(instance))).toBe(true);
		expect(signInCoversApplication(localMcpHost('http://localhost:9925', { port: 9926 }))).toBe(false);
	});
});

describe('client settings', () => {
	const operations = { part: 'operations' as const, target: 'https://node-1.example.com:9925', mountPath: '/mcp' };
	const application = { part: 'application' as const, target: 'https://node-1.example.com', mountPath: '/ai' };

	it('passes the arguments harper mcp print-config does, and never a credential', () => {
		expect(harperMcpArgs(operations)).toEqual(['mcp', '--target', 'https://node-1.example.com:9925']);
		expect(harperMcpArgs(application)).toEqual([
			'mcp',
			'--profile',
			'application',
			'--target',
			'https://node-1.example.com',
			'--mount-path',
			'/ai',
		]);
	});

	it("matches print-config's Claude Desktop block, with a key per part", () => {
		const config = mcpClientConfig('claude-desktop', [operations, application]);
		expect(JSON.parse(config.json)).toEqual({
			mcpServers: {
				harper: { command: 'harper', args: harperMcpArgs(operations) },
				'harper-application': { command: 'harper', args: harperMcpArgs(application) },
			},
		});
		expect(config.json).not.toMatch(/password|bearer|username/i);
	});

	it("matches print-config's Zed block", () => {
		expect(JSON.parse(mcpClientConfig('zed', [operations]).json)).toEqual({
			context_servers: { harper: { command: { path: 'harper', args: harperMcpArgs(operations), env: {} } } },
		});
	});
});
