// Tiny trend bot: EMA(4)/EMA(12) crossover with a momentum confirmation filter.
//
// Idea: in a mostly falling window the best trade is often no trade. This bot only
// buys a symbol when its fast EMA has just crossed above its slow EMA AND the
// symbol is already up at least 1% over the last 18 hourly bars, so it never buys
// a falling knife on a wick. It sells the whole position when the fast EMA
// crosses back below the slow EMA, or when the position is down 20% from cost
// (the harness caps max drawdown at 25%, so a hard 20% stop keeps the run
// compliant). After a stop-loss it will not re-enter the same symbol for 12
// bars, so a choppy market cannot make it buy the same falling symbol twice
// in a row. Otherwise it sits in USDC. Stake is equity split over the
// universe, capped at the harness 25% weight cap per symbol.
//
// Deterministic: float64 EMAs on closes only, no clock, no randomness, no
// network. Iteration order is the harness universe order.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const FAST_BARS = 4;
const SLOW_BARS = 12;
/** Entry needs +1% over this many bars. */
const MOMENTUM_BARS = 18;
const MOMENTUM_MIN = 0.01;
/** Hard stop: sell when the position is worth 4/5 of its cost. */
const STOP_NUM = 4n;
const STOP_DEN = 5n;
const MAX_SLIPPAGE_BPS = 100;

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  /** fast - slow after the previous bar, once both are set. */
  gap: number | null;
  now: number | null;
  /** Close history, oldest first, for the momentum filter. */
  closes: number[];
}

const series = new Map<string, Series>();
/** Last batch seq a symbol was stop-lossed on: no re-entry for 12 bars after. */
const stoppedAt = new Map<string, number>();
const STOP_COOLDOWN_BARS = 12;

function step(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

function push(bar: { symbol: string; c: string }): Series {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = {
      fast: { span: FAST_BARS, warm: [], value: null },
      slow: { span: SLOW_BARS, warm: [], value: null },
      gap: null,
      now: null,
      closes: [],
    };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  s.closes.push(c);
  step(s.fast, c);
  step(s.slow, c);
  s.gap = s.now;
  s.now = s.fast.value !== null && s.slow.value !== null ? s.fast.value - s.slow.value : null;
  return s;
}

/** True when the symbol rose at least MOMENTUM_MIN over the last MOMENTUM_BARS bars. */
function momentumOk(s: Series): boolean {
  if (s.closes.length <= MOMENTUM_BARS) return false;
  const now = s.closes[s.closes.length - 1];
  const then = s.closes[s.closes.length - 1 - MOMENTUM_BARS];
  return then > 0 && now / then - 1 >= MOMENTUM_MIN;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const crossUp = new Set<string>();
    const crossDown = new Set<string>();
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      const s = push(bar);
      fresh.add(bar.symbol);
      if (s.gap === null || s.now === null || bar.v === '0') continue;
      if (s.now > 0 && s.gap <= 0) crossUp.add(bar.symbol);
      if (s.now < 0 && s.gap >= 0) crossDown.add(bar.symbol);
    }
    if (state.warmingUp) return [];
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        const value = state.value(symbol, held.qty);
        const stopped = value * STOP_DEN <= held.cost * STOP_NUM;
        if (stopped) stoppedAt.set(symbol, batch.seq);
        if (crossDown.has(symbol) || stopped) {
          sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
      } else if (crossUp.has(symbol) && momentumOk(series.get(symbol)!)) {
        const lastStop = stoppedAt.get(symbol);
        if (lastStop !== undefined && batch.seq - lastStop < STOP_COOLDOWN_BARS) continue;
        entries.push(symbol);
      }
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size + sells.length;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
