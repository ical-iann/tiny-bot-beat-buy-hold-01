[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/ical-iann/tiny-bot-beat-buy-hold-01/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/ical-iann/tiny-bot-beat-buy-hold-01/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

# Tiny trend bot — beat buy-and-hold on Solana

A tiny paper-trading bot for hourly Solana prices: EMA(4)/EMA(12) crossover with an 18-bar momentum confirmation filter, a 20% stop-loss and a 12-bar re-entry cooldown, sitting in USDC when there is no uptrend. See the bounty: https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

## How it works

- Buys a symbol only when fast EMA(4) crosses above slow EMA(12) **and** the symbol is already up ≥1% over the last 18 hourly bars.
- Sells the whole position when EMA(4) crosses back below EMA(12), or when the position is down 20% from cost.
- After a stop-loss, the symbol is not re-entered for 12 bars.
- Stake is equity split over the universe, capped at the harness 25% weight cap; otherwise it holds USDC.

## Run

`main.ts` runs on Node 22 (`node main.ts`) under the `agent-fun/bars-replay/v1` harness; `vendor/makefun-bars.ts` is the kit's SDK shim, vendored byte for byte.

## Local dev result

On the kit dev window (136 hourly bars): net PnL **−$28.48** vs buy-and-hold **−$869.34** (beats it by ~$841), max drawdown 1.5%, 18 trades, guardrails compliant. The final window is a fresh 3-day window, so the dev margin is not a promise.
