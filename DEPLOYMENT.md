# GoDaddy Production Deployment

## Required environment variables

Set these in the GoDaddy Node.js App environment:

- `PORT`: value supplied by GoDaddy Preview/runtime
- `AUTH_SECRET`: random secret of at least 32 characters
- `GOOGLE_DRIVE_FILE_ID`: `1iwqvRKCTQZY2u0yC7ZRjOPFnImN6mRGS`
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`: complete new Google service-account JSON key
- `ALLOWED_ORIGINS`: production domain(s), comma-separated
- `NODE_ENV=production`

Do not set `VITE_*` or secret values in browser-visible variables.

The React app defaults to the same-origin API path, `/api`. Keep `VITE_API_URL=/api` when the frontend and API share a host; this avoids cross-origin preflight requests. If using separate hosts, set `ALLOWED_ORIGINS` to the exact frontend origins. The Airo production and preview origins are explicitly allowed by the server.

## Google key repair

An `invalid_grant: Invalid JWT Signature` means the private key is invalid, replaced, revoked, mismatched, or generated for another account/key version.

1. Open Google Cloud Console.
2. Create or select the service account.
3. Open Keys > Add key > Create new key > JSON.
4. Download the new JSON key.
5. Share the spreadsheet with the new service-account email as Editor.
6. Set the entire JSON object as `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` in GoDaddy.
7. Restart the Node app.

Do not reuse an old or previously revoked private key.

## Start command

- Startup file: `app.js`
- Node version: 22
- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm start`
- Health check: `/health`

The app must listen on `process.env.PORT` and serve `dist` assets. Do not run `npm run dev` in production.
