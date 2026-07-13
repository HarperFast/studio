// Spec registry barrel. Bespoke metric specs live in this directory
// (pipeline/<kebab>.tsx, or .ts for renderer-less specs); pure-wrapper specs
// live as entries in the `wrapperMetrics` factory table (wrapperMetrics.tsx).
// Everything is registered in `specRegistry` below — the registry keys are
// the canonical metric names.

import type { SpecRegistryEntry } from '../types/analytics';
import { ConnectionRenderer, connectionSpec } from './connection';
import { MainThreadRenderer, mainThreadUtilizationSpec } from './main-thread-utilization';
import { MemoryRenderer, memorySpec } from './memory';
import { ReplicationLatencyRenderer, replicationLatencySpec } from './replication-latency';
import { resourceUsageSpec } from './resource-usage';
import { storageVolumeSpec } from './storage-volume';
import { tlsReusedSpec } from './tls-reused';
import { utilizationSpec } from './utilization';
import { wrapperMetrics } from './wrapperMetrics';

export const specRegistry: Record<string, SpecRegistryEntry> = {
	'replication-latency': { spec: replicationLatencySpec, Renderer: ReplicationLatencyRenderer },
	'bytes-sent': wrapperMetrics['bytes-sent'],
	'bytes-received': wrapperMetrics['bytes-received'],
	'resource-usage': { spec: resourceUsageSpec },
	// 'connections' = active MQTT/WS session counts; distinct from
	// 'connection' below (per-path/method connect-success ratios).
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
	// snake_case matches Harper's wire metric name (response_200) — the one
	// exception to the kebab-case registry keys; do not normalize.
	'response_200': wrapperMetrics['response_200'],
	'utilization': { spec: utilizationSpec },
	'database-size': wrapperMetrics['database-size'],
	'storage-volume': { spec: storageVolumeSpec },
	'memory': { spec: memorySpec, Renderer: MemoryRenderer },
	'main-thread-utilization': { spec: mainThreadUtilizationSpec, Renderer: MainThreadRenderer },
	'cache-hit': wrapperMetrics['cache-hit'],
	'cache-resolution': wrapperMetrics['cache-resolution'],
};
