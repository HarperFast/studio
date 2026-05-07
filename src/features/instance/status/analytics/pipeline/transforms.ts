// Named transforms let specs stay serializable while still supporting
// non-trivial per-record math (e.g. `cpuUtilization × 100`). Add entries here
// as specs need them; never accept arbitrary functions from a spec.
export const namedTransforms = {
	'percent-of-core': (v: number) => v * 100,
} as const;

export type NamedTransformKey = keyof typeof namedTransforms;
