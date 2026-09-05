import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";

// This source is bundled into one CommonJS Vercel function during the build.
// The standalone adapter receives the native Node request Vercel provides,
// avoiding Express and its runtime dependency chain entirely.
export default createHTTPHandler({
  router: appRouter,
  createContext,
  basePath: "/api/trpc/",
});
