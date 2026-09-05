import type { MarketInstrument } from "./constants";

export type ExactMarketIntent = {
  instrument: MarketInstrument;
  quantity: number;
};

export function createExactMarketIntent(instrument: MarketInstrument, quantity: number): ExactMarketIntent {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Exact market quantity must be a positive whole number");
  }
  return { instrument, quantity };
}

export function createFillIntent(source: ExactMarketIntent, quantity: number): ExactMarketIntent {
  if (quantity > source.quantity) {
    throw new Error("Fill quantity exceeds the exact available amount");
  }
  return createExactMarketIntent(source.instrument, quantity);
}

export function createDirectPurchaseIntent(source: ExactMarketIntent): ExactMarketIntent {
  return createExactMarketIntent(source.instrument, source.quantity);
}
