# Vercel Function Diagnostic Notes

The active Vercel workspace is signed in and shows the `vouch-market` project at `vouch-market-two.vercel.app`. Its static `/market` route returns HTTP 200, while `/api/trpc/market.board` currently returns `FUNCTION_INVOCATION_FAILED`.

The deployed source now builds `api/trpc/[...path].cjs` from `server/vercel/trpcHandler.ts` before migration and frontend build. The next useful diagnostic is the complete error text shown in **Deployments → latest deployment → Functions → `/api/trpc/[...path]` → Logs** immediately after requesting the board endpoint. Do not copy any environment variable values into logs or chat.
