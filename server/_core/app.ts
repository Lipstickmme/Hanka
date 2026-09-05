import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { ARC_RPC_PROXY_PATH } from "../../shared/arcNetwork";
import { arcRpcProxyHandler } from "../arc/rpcProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

export function createVouchApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  // Mirrors the Vercel function at api/arc-rpc so the browser reads chain state
  // from its own origin in development too.
  app.post(ARC_RPC_PROXY_PATH, arcRpcProxyHandler);
  return app;
}
