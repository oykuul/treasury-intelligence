# Corporate Liquidity & ALM Scope

## Product definition

Corporate ALM Intelligence is a simplified corporate asset-liability management system. It is not a bank regulatory ALM platform and it is not limited to a short-term cash dashboard.

The product connects cash positions, contractual receivables and payables, credit facilities, and debt schedules to show when the company has liquidity, maturity, funding, concentration, or interest-rate risk.

Foreign-exchange information remains part of the canonical data model, but derivative valuation and hedge execution are outside the initial scope because material hedging and foreign-currency activity are uncommon in the target operating model.

## Product modules

| Module | Decision supported | Horizon |
| --- | --- | --- |
| Executive ALM Overview | Is the balance-sheet and liquidity position within policy? | Today to 12 months |
| Liquidity Forecast | When does cash fall below the operating buffer? | Daily, 90 days |
| Maturity Gap | Which time buckets contain asset-liability mismatches? | 7 days to over 12 months |
| Debt & Funding | Where are maturity walls, refinancing needs, and lender concentrations? | 12–36 months |
| Interest Rate Risk | How much exposure reprices and how do rate shocks affect interest expense? | 12 months |
| Stress Scenarios | What funding is required under delayed collections, accelerated payments, and rate shocks? | 90 days to 12 months |
| What Changed | Which records explain the movement since the prior reporting period? | Current versus previous |
| Data & Positions | Are source files complete, mapped, reconciled, and current? | As of reporting date |

## Required source datasets

| Dataset | Minimum fields |
| --- | --- |
| Cash balances | Entity, bank, account, currency, available balance, restricted balance, as-of date |
| Receivables | Entity, counterparty, due date, amount, currency, document identity |
| Payables | Entity, counterparty, due date, amount, currency, document identity |
| Debt | Entity, lender, instrument, outstanding principal, fixed/floating, rate, next payment, maturity |
| Credit facilities | Entity, lender, facility ID, committed limit, drawn amount, available amount, maturity, rate basis |

Manual entry uses the same canonical contracts as imported files, so manually entered assumptions and uploaded records can be analyzed together.

## Core deterministic outputs

- available and restricted liquidity
- minimum forecast cash and policy-buffer headroom
- 30/90-day funding need
- contractual asset, liability, net, and cumulative gap by maturity bucket
- debt service and maturity wall
- committed facility utilization and residual funding gap
- lender, bank, counterparty, and entity concentration
- fixed/floating debt mix and repricing gap
- annual interest-expense sensitivity at +100, +200, and +300 basis points
- Base, Moderate, and Severe scenario comparison
- item-level movement attribution and unexplained movement reconciliation

## Delivery sequence

1. Preserve the validated 90-day liquidity module.
2. Add cash-balance and credit-facility canonical datasets.
3. Add manual position and assumption entry.
4. Build the 12-month maturity ladder and cumulative gap. **Delivered in v0.8.0.**
5. Add debt/funding profile and lender concentration.
6. Add repricing gap and interest-rate sensitivity.
7. Consolidate every module into the Executive ALM Overview.
