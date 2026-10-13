# AgentMatch

Real estate agent directory for loan officers. Phase 1 prototype inspired by [Model Match](https://modelmatch.com/).

## Phase 1 (this build)

- State → city → scope market picker (every export comes from one city in one state)
- Split UI: summary stats, filters and agent list on the left, map on the right
- Filters: search (name, email, phone, license), transaction range, last-transaction window, side focus (60/40 lean), ZIPs active, sell/buy minimums, date ranges, removable filter chips
- Live stats strip for whatever is currently filtered
- Map pins colored by side focus, volume or recency; click a pin or row to see the agent card
- Export dialog: CRM contact CSV (First Name, Last Name, Email, Phone, Tags) or full vendor data; skips shared team inboxes and optionally agents without phones
- Export history (city, state, filters, contact count), stored in this browser
- No auth / no admin (public directory prototype)

## Data cleaning

Done in `src/lib/agents.ts` when the CSV is parsed:

- Names are proper-cased and "PA"/"LLC" suffixes dropped. Accents damaged by the vendor's code-page mix-up are repaired (`D¡AZ` → `Díaz`).
- Emails are lower-cased. Emails used by more than one agent are flagged "shared" because a CRM import may merge those contacts.
- "Active in the last N days" counts back from the newest transaction in the file, not today's date.

## Later

- Subaccount access control
- Direct CRM import
- Per-user export logging on the server
- Automated vendor data feed (API)

## Data approach

Phase 1 reads CSV files from `/data` at request time on the server. That keeps the prototype simple and avoids a database. Supabase + a Vercel cron can come later when the vendor feed is automated.

Map pins are approximate: the CSV has no lat/lng, so agents get a stable pseudo-location inside a land-fitted ellipse per market (`spreadKm` in `src/lib/markets.ts`). Swap in real geocoding when the vendor feed has addresses.

The basemap is Esri World Light Gray (no API key). Move to a keyed provider before heavy production traffic.

Keep vendor CSVs out of `public/`: anything there is downloadable by URL.

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
