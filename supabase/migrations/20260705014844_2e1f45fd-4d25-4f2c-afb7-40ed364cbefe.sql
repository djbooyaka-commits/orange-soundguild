create table public.artist_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_signature text not null unique,
  token text not null check (token in ('SOL','USDC')),
  amount numeric not null,
  from_wallet text not null,
  network text not null default 'mainnet-beta',
  paid_at timestamptz not null default now(),
  expires_at timestamptz not null
);
grant select, insert on public.artist_subscriptions to authenticated;
grant all on public.artist_subscriptions to service_role;
alter table public.artist_subscriptions enable row level security;
create policy "own subs read" on public.artist_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "own subs insert" on public.artist_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create index artist_subs_user_expires_idx on public.artist_subscriptions (user_id, expires_at desc);