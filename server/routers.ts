import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { arcBountyRouter } from "./routers/arcBounty";

export const appRouter = router({
  system: systemRouter,
  arcBounty: arcBountyRouter,
});

export type AppRouter = typeof appRouter;
