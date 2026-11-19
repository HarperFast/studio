# Harper's reference client for `encrypted_operation`

`sealedOperation.ts` and `secretEnvelope.ts` are `utility/sealedOperation.ts` and `utility/secretEnvelope.ts` from
HarperFast/harper at tag `v5.4.0` (commit `c5d82cff73e4088ea25150ae7d26c4ace6c2d3ed`), copied unchanged: the node's own
tests use them, so what opens here is what the node accepts and answers. They are excluded from `dprint` for that
reason, and `tsconfig.app.json` allows their `.ts` import specifier. Check them against the tag with:

```bash
git -C <harper> show v5.4.0:utility/sealedOperation.ts | diff - sealedOperation.ts
git -C <harper> show v5.4.0:utility/secretEnvelope.ts | diff - secretEnvelope.ts
```

Only `src/lib/crypto/sealedOperation.test.ts` and `src/integrations/api/instance/sealedOperation.test.ts` import them.
