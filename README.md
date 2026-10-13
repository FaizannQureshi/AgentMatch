# AgentMatch

Real estate agent directory for loan officers. Phase 1 prototype inspired by [Model Match](https://modelmatch.com/).

## Phase 1 (this build)

- Split UI: filters + agent list on the left, map on the right
- Markets from vendor CSVs: Tampa `33647` and Tampa city-wide
- Filters: search, min transactions, side focus, zips active, date ranges, sort
- CSV export of filtered or selected agents
- No auth / no admin (public directory prototype)

## Phase 2 (planned)

- GHL subaccount SSO via custom menu link (agency-level key)
- Direct import into GHL subaccount contacts
- Per-user export logging
- Automated vendor data feed (API)

## Data approach

Phase 1 reads CSV files from `/data` at request time on the server. That keeps the prototype simple and avoids a database. Supabase + a Vercel cron can come later when the vendor feed is automated.

Map pins are approximate: the CSV has no lat/lng, so agents are placed with a deterministic offset around each market centroid.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

```bash
npm run build
vercel --prod
```

## CSV columns

`Agent Name`, `Email`, `Phone`, `State License`, `Sell-Side Transactions`, `Buy-Side Transactions`, `Total Transactions`, `Zips Active`, `First Transaction`, `Last Transaction`
