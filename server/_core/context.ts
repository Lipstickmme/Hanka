import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: IncomingMessage;
  res: ServerResponse;
  user: User | null;
};

export async function createContext(
  opts: Pick<TrpcContext, "req" | "res">
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    // Market participation and private operations use wallet-bound signed
    // proofs rather than the template's OAuth session identity.
    user: null,
  };
}
