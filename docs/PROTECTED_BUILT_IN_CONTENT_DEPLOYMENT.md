# Protected Built-In Content Deployment

Phase E keeps rich built-in lesson material out of the public frontend bundle and serves it only after the backend authorizes the requesting student and classroom. Deployment ordering and cache cleanup are part of that protection because historical frontend builds contained the lesson bodies.

## Required deployment sequence

1. Deploy the backend first. It must provide the protected content endpoint, exact-classroom membership authorization, the Phase D progression gate, and the safe catalogue behavior.
2. Verify backend health and confirm allowed and denied content requests behave as expected.
3. Build and audit the frontend:

   ```powershell
   cd frontend
   npm run test:protected-content-audit
   npm run build
   npm run audit:protected-content:source
   npm run audit:protected-content:dist
   ```

4. Deploy the audited frontend build.
5. Remove obsolete frontend HTML, hashed assets, and chunks from the active hosting/CDN layer, then invalidate its caches. Use the deployment provider's verified operational procedure; this repository does not define a provider-specific purge command.
6. Verify that URLs for old hashed rich-content assets no longer return those assets through the deployed origin or CDN, and verify that the new asset inventory is being served.
7. Smoke-test an authorized student request and denied cases for an unauthenticated user, a non-member, and a student blocked by the progression gate.

The source and bundle audits prove properties of the build being deployed. Removing old assets and invalidating caches is a separate operational control and must not be inferred from a successful application build.

## Cache behavior

Protected content responses use:

```http
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Authorization
```

These headers prevent intended shared or persistent caching of new protected API responses. They do not erase historical frontend assets or data a client has already downloaded.

## Security boundary and historical limitation

The objective is that unauthorized or pre-gate users do not receive protected rich module content through the frontend bundle or an unrestricted API. Content delivered to an authorized browser can still be inspected or copied by that authorized user; this is access control, not DRM.

Previously downloaded or cached historical bundles cannot be cryptographically or remotely revoked from a client that already possesses them. Purging the deployed origin/CDN prevents future retrieval through those controlled delivery paths but cannot erase existing copies.

## Rollback warning

Do not roll back to an older frontend build that embeds rich lesson content. Such a rollback reintroduces the disclosure and is a security regression. Prefer a roll-forward deployment using a corrected, freshly audited frontend build while keeping the compatible protected backend available.
