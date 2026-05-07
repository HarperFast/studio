// Spec registry barrel. Step 1 populates this file with per-metric spec imports
// and a `specRegistry` map. Step 0 ships the scaffold + known-names export so the
// allowlist codegen can read something.

// When a spec lands at src/lib/metricSpecs/<kebab>.ts it is added to KNOWN_METRICS
// here. This list is the source of truth for the backend allowlist generator.
export const KNOWN_METRICS = [
	'replication-latency',
	'resource-usage',
	'memory',
	'mqtt-connections',
	'ws-connections',
	'main-thread-utilization',
	'bytes-sent',
	'bytes-received',
	'table-size',
	'duration',
	'success',
	'transfer',
	'tls-reused',
	'connection',
	'cpu-usage',
	'db-read',
	'db-write',
	'db-message',
	'response_200',
	'utilization',
	'database-size',
	'storage-volume',
	'cache-hit',
	'cache-resolution',
] as const;

export type KnownMetric = (typeof KNOWN_METRICS)[number];

import type { SpecRegistryEntry } from '../types/analytics.ts';
import { BytesReceivedRenderer, bytesReceivedSpec } from './bytes-received.tsx';
import { BytesSentRenderer, bytesSentSpec } from './bytes-sent.tsx';
import { CacheHitRenderer, cacheHitSpec } from './cache-hit.tsx';
import { CacheResolutionRenderer, cacheResolutionSpec } from './cache-resolution.tsx';
import { ConnectionRenderer, connectionSpec } from './connection.tsx';
import { ConnectionsRenderer, connectionsSpec } from './connections.tsx';
import { CpuUsageRenderer, cpuUsageSpec } from './cpu-usage.tsx';
import { DatabaseSizeRenderer, databaseSizeSpec } from './database-size.tsx';
import { DbMessageRenderer, dbMessageSpec } from './db-message.tsx';
import { DbReadRenderer, dbReadSpec } from './db-read.tsx';
import { DbWriteRenderer, dbWriteSpec } from './db-write.tsx';
import { DurationRenderer, durationSpec } from './duration.tsx';
import { MainThreadRenderer, mainThreadUtilizationSpec } from './main-thread-utilization.tsx';
import { MemoryRenderer, memorySpec } from './memory.tsx';
import { ReplicationLatencyRenderer, replicationLatencySpec } from './replication-latency.tsx';
import { resourceUsageSpec } from './resource-usage.ts';
import { Response200Renderer, response200Spec } from './response-200.tsx';
import { storageVolumeSpec } from './storage-volume.ts';
import { SuccessRenderer, successSpec } from './success.tsx';
import { tlsReusedSpec } from './tls-reused.ts';
import { TransferRenderer, transferSpec } from './transfer.tsx';
import { utilizationSpec } from './utilization.ts';

export const specRegistry: Record<string, SpecRegistryEntry> = {
	'replication-latency': { spec: replicationLatencySpec, Renderer: ReplicationLatencyRenderer },
	'bytes-sent': { spec: bytesSentSpec, Renderer: BytesSentRenderer },
	'bytes-received': { spec: bytesReceivedSpec, Renderer: BytesReceivedRenderer },
	'resource-usage': { spec: resourceUsageSpec },
	'connections': { spec: connectionsSpec, Renderer: ConnectionsRenderer },
	'duration': { spec: durationSpec, Renderer: DurationRenderer },
	'success': { spec: successSpec, Renderer: SuccessRenderer },
	'transfer': { spec: transferSpec, Renderer: TransferRenderer },
	'tls-reused': { spec: tlsReusedSpec },
	'connection': { spec: connectionSpec, Renderer: ConnectionRenderer },
	'cpu-usage': { spec: cpuUsageSpec, Renderer: CpuUsageRenderer },
	'db-read': { spec: dbReadSpec, Renderer: DbReadRenderer },
	'db-write': { spec: dbWriteSpec, Renderer: DbWriteRenderer },
	'db-message': { spec: dbMessageSpec, Renderer: DbMessageRenderer },
	'response_200': { spec: response200Spec, Renderer: Response200Renderer },
	'utilization': { spec: utilizationSpec },
	'database-size': { spec: databaseSizeSpec, Renderer: DatabaseSizeRenderer },
	'storage-volume': { spec: storageVolumeSpec },
	'memory': { spec: memorySpec, Renderer: MemoryRenderer },
	'main-thread-utilization': { spec: mainThreadUtilizationSpec, Renderer: MainThreadRenderer },
	'cache-hit': { spec: cacheHitSpec, Renderer: CacheHitRenderer },
	'cache-resolution': { spec: cacheResolutionSpec, Renderer: CacheResolutionRenderer },
};
