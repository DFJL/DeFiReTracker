-- LP Manager: first-class LP positions, balance snapshots and derived events.
-- Additive only: no existing table is modified.

create table if not exists crypto.lp_positions (
  id           uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references crypto.portfolios(id) on delete cascade,
  name         text not null,
  protocol     text,                                   -- e.g. 'beefy'
  chain        text,
  pair_type    text not null default 'v2'
               check (pair_type in ('v2', 'other')),   -- 'v2' = constant product (fees/IL split supported)
  token0_id    uuid not null references crypto.assets(id),
  token1_id    uuid not null references crypto.assets(id),
  external_ref text,                                   -- vault / pool address
  status       text not null default 'open' check (status in ('open', 'closed')),
  notes        text,
  created_at   timestamptz not null default now()
);

-- Append-only source of truth: what the position held at a point in time.
create table if not exists crypto.lp_snapshots (
  id           uuid primary key default gen_random_uuid(),
  position_id  uuid not null references crypto.lp_positions(id) on delete cascade,
  portfolio_id uuid not null references crypto.portfolios(id) on delete cascade,
  ts           timestamptz not null,
  shares       numeric not null check (shares >= 0),   -- LP / mooToken balance
  amount0      numeric not null check (amount0 >= 0),  -- underlying token0 owned by the position
  amount1      numeric not null check (amount1 >= 0),
  price0_usd   numeric not null,
  price1_usd   numeric not null,
  flow0        numeric,                                -- optional explicit moved amounts (override inference)
  flow1        numeric,
  source       text not null default 'manual' check (source in ('manual', 'import', 'onchain')),
  tx_hash      text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists lp_snapshots_position_ts on crypto.lp_snapshots (position_id, ts);

-- Derived ledger: one deposit/withdraw (flow) and/or performance row per snapshot interval.
create table if not exists crypto.lp_events (
  id            uuid primary key default gen_random_uuid(),
  position_id   uuid not null references crypto.lp_positions(id) on delete cascade,
  portfolio_id  uuid not null references crypto.portfolios(id) on delete cascade,
  snapshot_id   uuid not null references crypto.lp_snapshots(id) on delete cascade,
  prev_snapshot_id uuid references crypto.lp_snapshots(id) on delete set null,
  ts            timestamptz not null,
  kind          text not null check (kind in ('deposit', 'withdraw', 'performance')),
  amount0       numeric,
  amount1       numeric,
  value_usd     numeric not null,
  price_usd     numeric,       -- performance: price effect on the hodl basket
  il_usd        numeric,       -- performance: impermanent loss (v2 only)
  fees_usd      numeric,       -- performance: fees / compounding (v2 only)
  other_usd     numeric,       -- performance: unsplit remainder (non-v2 pairs, overrides)
  overridden    boolean not null default false,        -- user manually corrected the classification
  created_at    timestamptz not null default now()
);
create index if not exists lp_events_position_ts on crypto.lp_events (position_id, ts);

alter table crypto.lp_positions enable row level security;
alter table crypto.lp_snapshots enable row level security;
alter table crypto.lp_events    enable row level security;

create policy lp_positions_access on crypto.lp_positions for all
  using (crypto.user_has_portfolio_access(portfolio_id))
  with check (crypto.user_has_portfolio_access(portfolio_id));
create policy lp_snapshots_access on crypto.lp_snapshots for all
  using (crypto.user_has_portfolio_access(portfolio_id))
  with check (crypto.user_has_portfolio_access(portfolio_id));
create policy lp_events_access on crypto.lp_events for all
  using (crypto.user_has_portfolio_access(portfolio_id))
  with check (crypto.user_has_portfolio_access(portfolio_id));
