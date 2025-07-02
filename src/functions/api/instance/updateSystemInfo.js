import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

const B2GB1000 = 1000000000; // for mac disk and transfer
const B2GB1024 = 1073741824; // for non-mac disk

export default async ({ auth, url, signal, refresh, is_local, cachedSystemInfo, skip = [] }) => {
	// skip attributes added because network and disk currently expensive instance ops
	// provides more fine-grained control over which items are cached.

	const systemAttributes = ['network', 'disk', 'cpu', 'memory', 'system'];
	const result = await queryInstance({
		operation: {
			operation: 'system_information',
			attributes: skip?.length ? systemAttributes.filter((attr) => !skip.includes(attr)) : systemAttributes,
		},
		auth,
		url,
		signal,
	});

	if (result.error && refresh) {
		return instanceState.update((s) => {
			s.systemInfoError = true;
		});
	}

	if (result.error) {
		return instanceState.update((s) => {
			s.systemInfo = {
				totalMemory: '...',
				usedMemory: '...',
				freeMemory: '...',
				memoryStatus: 'grey',
				totalDisk: '...',
				usedDisk: '...',
				freeDisk: '...',
				diskStatus: 'grey',
				cpuInfo: '...',
				cpuCores: '...',
				cpuLoad: '...',
				cpuStatus: 'grey',
				networkTransferred: '...',
				networkReceived: '...',
				networkLatency: '...',
				networkLatencyStatus: 'grey',
			};
			s.systemInfoError = true;
		});
	}

	// MEMORY
	const totalMemory = skip.includes('memory')
		? parseFloat(cachedSystemInfo.totalMemory)
		: result.memory.total / B2GB1024;
	const usedMemory = skip.includes('memory')
		? parseFloat(cachedSystemInfo.usedMemory)
		: result.memory.active / B2GB1024;
	const freeMemory = skip.includes('memory')
		? parseFloat(cachedSystemInfo.freeMemory)
		: result.memory.available / B2GB1024;
	const memoryStatus = skip.includes('memory')
		? cachedSystemInfo.memoryStatus
		: freeMemory / totalMemory < 0.1
			? 'danger'
			: freeMemory / totalMemory < 0.25
				? 'warning'
				: 'success';

	// DISK
	const totalDisk = skip.includes('disk')
		? parseFloat(cachedSystemInfo.totalDisk)
		: result.system.platform === 'darwin'
			? result.disk?.size?.[0].size / B2GB1000
			: !is_local
				? result.disk?.size?.find((disk) => disk.mount === '/home/ubuntu/hdb').size / B2GB1024
				: result.disk?.size?.[0].size / B2GB1024;

	const usedDisk = skip.includes('disk')
		? parseFloat(cachedSystemInfo.usedDisk)
		: result.system.platform === 'darwin'
			? result.disk?.size?.reduce((a, b) => a + b.used, 0) / B2GB1000
			: !is_local
				? result.disk?.size?.find((disk) => disk.mount === '/home/ubuntu/hdb').used / B2GB1024
				: result.disk?.size?.reduce((a, b) => a + b.used, 0) / B2GB1024;

	const freeDisk = skip.includes('disk') ? parseFloat(cachedSystemInfo.freeDisk) : totalDisk - usedDisk;

	const diskStatus = skip.includes('disk')
		? cachedSystemInfo.diskStatus
		: freeDisk / totalDisk < 0.1
			? 'danger'
			: freeDisk / totalDisk < 0.25
				? 'warning'
				: 'success';

	// CPU
	const cpuInfo = skip.includes('cpu') ? cachedSystemInfo.cpuInfo : `${result.cpu.manufacturer} ${result.cpu.brand}`;
	const cpuCores = skip.includes('cpu')
		? cachedSystemInfo.cpuCores
		: `${result.cpu.physicalCores} physical / ${result.cpu.cores} virtual`;
	const cpuLoad = skip.includes('cpu')
		? parseFloat(cachedSystemInfo.cpuLoad)
		: result.cpu.current_load.currentLoad || result.cpu.current_load.currentload || 0;
	const cpuStatus = skip.includes('cpu')
		? cachedSystemInfo.cpuStatus
		: cpuLoad > 90
			? 'danger'
			: cpuLoad > 75
				? 'warning'
				: 'success';

	// NETWORK
	const networkTransferred = skip.includes('network')
		? parseFloat(cachedSystemInfo.networkTransferred)
		: result.network.stats.reduce((a, b) => a + b.tx_bytes, 0) / B2GB1000;
	const networkReceived = skip.includes('network')
		? parseFloat(cachedSystemInfo.networkReceived)
		: result.network.stats.reduce((a, b) => a + b.rx_bytes, 0) / B2GB1000;
	const networkLatency = skip.includes('network')
		? parseFloat(cachedSystemInfo.networkLatency)
		: result.network.latency.ms;
	const networkLatencyStatus = skip.includes('network')
		? parseFloat(cachedSystemInfo.networkLatencyStatus)
		: networkLatency > 1000
			? 'danger'
			: networkLatency > 500
				? 'warning'
				: 'success';

	const systemInfo = {
		totalMemory: totalMemory?.toFixed(2),
		usedMemory: usedMemory?.toFixed(2),
		freeMemory: freeMemory?.toFixed(2),
		memoryStatus,
		totalDisk: totalDisk?.toFixed(2),
		usedDisk: usedDisk?.toFixed(2),
		freeDisk: freeDisk?.toFixed(2),
		diskStatus,
		cpuInfo,
		cpuCores,
		cpuLoad: cpuLoad?.toFixed(2),
		cpuStatus,
		networkTransferred: networkTransferred?.toFixed(2),
		networkReceived: networkReceived?.toFixed(2),
		networkLatency,
		networkLatencyStatus,
	};

	return instanceState.update((s) => {
		s.systemInfo = systemInfo;
	});
};
