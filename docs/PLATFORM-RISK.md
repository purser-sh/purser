# Platform risk (asOf 2026-08-25)

Purser wraps **the user’s** CLI logins and API keys. We do not resell Anthropic, OpenAI, Google, or Cursor access. This page records what we actually opened on the vendor sites. It is **not** legal advice. A human must decide whether wrapping a vendor CLI is allowed for a public launch.

Do not treat a summary here as the contract. The linked document wins.

## Anthropic

- Document: [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms)
- Opened: 2026-08-25
- Applies to: Anthropic API keys and offerings that reference those terms (not the same as the consumer Claude.ai terms).
- Facts we will stand on:
  - Customer retains Inputs and owns Outputs; Anthropic **may not train** on Customer Content from those Services.
  - D.4 Use Restrictions: Customer may not access the Services to **build a competing product or service**, including to train competing models or **resell the Services** except as expressly approved.
- Purser implication (flag, not a conclusion): we spawn `claude` with the user’s existing CLI login. That is not reselling API keys. Whether a **console around Claude Code** is a “competing product” is a lawyer question. Do not ship a public cloud cell that multiplexes one Anthropic account across tenants.

## OpenAI

- Document: [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) (effective **January 1, 2026**)
- Opened: 2026-08-25
- Applies to: APIs and business/developer services, not consumer ChatGPT Terms of Use.
- Facts we will stand on:
  - Customer may integrate the API into Customer Applications.
  - Customer may not **resell or lease** Account access; may not buy/sell/transfer API keys.
  - May not use Output to develop models that compete with OpenAI (with a Permitted Exception in the agreement).
  - May not circumvent **Usage Limits**.
- Purser implication: Codex CLI is the user’s login. Do not pool keys. Do not scrape or train on Codex output. Hosted cells must be one tenant’s credentials per runner.

## Google (Gemini API)

- Document: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (effective **March 23, 2026**)
- Opened: 2026-08-25
- Facts we will stand on:
  - Must also accept the Google APIs Terms of Service.
  - 18+; not for API clients directed at under-18s.
  - Professional/business use, not consumer Gemini-the-app.
  - **Paid Services only** when making API clients available to users in the EEA, Switzerland, or UK.
  - May not use the Services to develop models that compete with Gemini API / Google AI Studio.
  - Unpaid vs Paid data use differs (unpaid content may be used to improve Google products; paid has a carve-out — read the page).
- Purser implication: `gemini_cli` is the user’s install. A hosted Purser cell that exposes Gemini to third parties in the EEA needs **Paid** Gemini, not unpaid AI Studio quota.

## Cursor (Anysphere)

- Document: [Terms of Service](https://cursor.com/terms-of-service) (includes Acceptable Use Policy by reference)
- Opened: 2026-08-25
- Facts we will stand on:
  - Anysphere will **not** use Content to train models unless the user explicitly agrees.
  - 1.5 Use Restrictions include: no reverse engineering; no rent/lease/lend/**sell the Service**; no using the Service or Suggestions to develop or train a model competitive with the Service.
  - Cursor documents an official **headless CLI** and Cloud Agents API. Forum guidance (not the contract) distinguishes wrapping the official API from reselling Cursor itself.
- Purser implication: we shell out to Cursor CLI with the user’s login. That is closer to the documented CLI than to reselling Cursor. Hosted cells that offer “Cursor to your customers” are the 1.5(iii) risk. Cloud Agents run on Cursor VMs — Purser must not pretend it is Cursor Cloud.

## What we are not doing (so the risk stays in the wrapper, not in a stolen API)

- We do not train models on vendor outputs.
- We do not publish vendor API keys or put them in SQLite.
- We do not circumvent rate limits.
- Cloud APIs never take host filesystem paths ([REVIEW.md](REVIEW.md) §4.2).

## Human decisions still open

- Is a public Purser binary that launches `claude` / `codex` / `cursor-agent` / `gemini` on the user’s machine acceptable under each vendor’s current terms? **Counsel.**
- Consumer OAuth vs API keys for Claude Code / Codex — follow each vendor’s current CLI docs; do not invent a workaround.
- Cursor AUP language about automated/non-human access vs the official CLI: use the CLI as documented; do not scrape the editor UI.
