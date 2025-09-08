const nodeVariant = ['secondary', 'default', 'warning', 'outline', 'success', 'destructive'] as const;

export type BadgeNodeVariantValues = (typeof nodeVariant)[number];

export { nodeVariant };
