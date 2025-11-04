export function calculateCreateClusterDeepLink() {
	// NOTE: This is also embedded in public/running.js
	return 'https://fabric.harper.fast/#/?createCluster=' + encodeURIComponent(JSON.stringify({
		deploymentDescription: 'Self-Hosted',
		performanceDescription: 'Self Supported and Managed',
		instances: [
			{
				secure: String(location.protocol === 'https:'),
				fqdn: location.hostname,
				port: parseInt(location.port, 10),
			},
		],
	}));
}
