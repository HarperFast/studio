// Spec registry barrel. Bespoke metric specs live in this directory
// (pipeline/<kebab>.tsx, or .ts for renderer-less specs); pure-wrapper specs
// live as entries in the `wrapperMetrics` factory table (wrapperMetrics.tsx).
// Everything is registered in `specRegistry` below — the registry keys are
// the canonical metric names.

import type { SpecRegistryEntry } from '../types/analytics.ts';
import { ConnectionRenderer, connectionSpec } from './connection.tsx';
import { MainThreadRenderer, mainThreadUtilizationSpec } from './main-thread-utilization.tsx';
import { MemoryRenderer, memorySpec } from './memory.tsx';
import { ReplicationLatencyRenderer, replicationLatencySpec } from './replication-latency.tsx';
import { resourceUsageSpec } from './resource-usage.ts';
import { storageVolumeSpec } from './storage-volume.ts';
import { tlsReusedSpec } from './tls-reused.ts';
import { utilizationSpec } from './utilization.ts';
import { wrapperMetrics } from './wrapperMetrics.tsx';

export const specRegistry: Record<string, SpecRegistryEntry> = {
	'replication-latency': { spec: replicationLatencySpec, Renderer: ReplicationLatencyRenderer },
	'bytes-sent': wrapperMetrics['bytes-sent'],
	'bytes-received': wrapperMetrics['bytes-received'],
	'resource-usage': { spec: resourceUsageSpec },
	'connections': wrapperMetrics['connections'],
	'duration': wrapperMetrics['duration'],
	'success': wrapperMetrics['success'],
	'transfer': wrapperMetrics['transfer'],
	'tls-reused': { spec: tlsReusedSpec },
	'connection': { spec: connectionSpec, Renderer: ConnectionRenderer },
	'cpu-usage': wrapperMetrics['cpu-usage'],
	'db-read': wrapperMetrics['db-read'],
	'db-write': wrapperMetrics['db-write'],
	'db-message': wrapperMetrics['db-message'],
	'response_200': wrapperMetrics['response_200'],
	'utilization': { spec: utilizationSpec },
	'database-size': wrapperMetrics['database-size'],
	'storage-volume': { spec: storageVolumeSpec },
	'memory': { spec: memorySpec, Renderer: MemoryRenderer },
	'main-thread-utilization': { spec: mainThreadUtilizationSpec, Renderer: MainThreadRenderer },
	'cache-hit': wrapperMetrics['cache-hit'],
	'cache-resolution': wrapperMetrics['cache-resolution'],
};
