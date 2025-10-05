# CORS Configuration Fix for Production

## Issue
Login page shows "Not allowed by CORS" error when accessing from `https://private.lumiku.com/login`

## Root Cause
The backend CORS configuration in `src/middleware/security.ts` uses the `ALLOWED_ORIGINS` environment variable to determine which origins are allowed to make requests. This variable was not set in the production environment.

### CORS Configuration (security.ts:193-209)
```typescript
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

When `ALLOWED_ORIGINS` is not set, it defaults to `['http://localhost:3000', 'http://localhost:3001']`, which doesn't include the production domain.

## Solution

### 1. Update .env.production
Added `ALLOWED_ORIGINS` to the production environment reference:

```bash
ALLOWED_ORIGINS="https://private.lumiku.com,https://lumiku.com"
```

### 2. Set Environment Variable in Coolify
The `ALLOWED_ORIGINS` environment variable must be set in Coolify:

**Go to Coolify Dashboard → VideoMixPro App → Environment Variables**

Add:
- **Variable Name**: `ALLOWED_ORIGINS`
- **Value**: `https://private.lumiku.com,https://lumiku.com`

### 3. Redeploy
After setting the environment variable, redeploy the application for changes to take effect.

## Testing
After deployment, verify CORS is working:

1. **Browser Test**:
   - Open https://private.lumiku.com/login
   - Open browser console (F12)
   - Should NOT see "Not allowed by CORS" error
   - Login should work properly

2. **CURL Test**:
   ```bash
   curl -X OPTIONS https://private.lumiku.com/api/v1/auth/login \
     -H "Origin: https://private.lumiku.com" \
     -H "Access-Control-Request-Method: POST" \
     -v
   ```

   Should see:
   - `Access-Control-Allow-Origin: https://private.lumiku.com`
   - `Access-Control-Allow-Credentials: true`
   - HTTP 204 No Content (success)

## Files Modified
- `.env.production` - Added ALLOWED_ORIGINS
- `DEPLOYMENT-CHECKLIST.md` - Added note about ALLOWED_ORIGINS validation
- `DEPLOYMENT-CORS-FIX.md` - This file (documentation)

## Important Notes
1. **Multiple Origins**: Use comma-separated values for multiple allowed origins
2. **No Trailing Slash**: Don't include trailing slashes in origins (use `https://example.com`, not `https://example.com/`)
3. **Protocol Required**: Always include the protocol (`https://` or `http://`)
4. **Wildcard Not Recommended**: Avoid using `*` for `credentials: true` CORS (it won't work)

## Related Configuration
Other CORS-related settings in the middleware:
- `credentials: true` - Allows cookies/auth headers
- `methods` - Allowed HTTP methods
- `allowedHeaders` - Allowed request headers

## Deployment Steps
1. ✅ Update `.env.production` (done)
2. ⏳ Set `ALLOWED_ORIGINS` in Coolify environment variables
3. ⏳ Redeploy application
4. ⏳ Test login from browser
5. ⏳ Verify no CORS errors in console

---

**Created**: 2025-10-05
**Status**: Ready for deployment
