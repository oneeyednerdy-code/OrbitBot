# Orbit v0.1.0-alpha.61

## R2 Worker binding

The Worker is now configured for the bucket created with:

```bash
npx wrangler r2 bucket create orbit-storage
```

The generated binding is:

```json
{
  "r2_buckets": [
    {
      "bucket_name": "orbit-storage",
      "binding": "orbit_storage",
      "remote": true
    }
  ]
}
```

Direct short-form video uploads use `orbit_storage`. The `remote: true` setting makes local Wrangler development use the real bucket. Older deployments that still expose `STORAGE` remain compatible, and public HTTPS video URLs continue to work when no R2 binding is available.

## Validation

- TypeScript typecheck passed
- Reliability tests passed
- Browser wiring checks passed
- Worker bundle passed
- ZIP integrity passed
