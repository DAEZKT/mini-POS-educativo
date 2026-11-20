-- Installation modes and administrator-controlled access to private business data.
create table public.installation_settings (
  singleton boolean primary key default true check (singleton),
  access_mode text not null default 'personal' check (access_mode in ('personal', 'saas')),
  initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.installation_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table public.installation_access (
  user_id text primary key,
  email text not null default '',
  status text not null check (status in ('pending', 'approved', 'revoked')),
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

-- Existing business owners keep access after this migration. Admin status is
-- deliberately assigned separately by the installation owner during bootstrap.
insert into public.installation_access (user_id, status, role, reviewed_at)
select b.owner_user_id, 'approved', 'owner', now()
from public.businesses b
on conflict (user_id) do nothing;

alter table public.installation_settings enable row level security;
alter table public.installation_access enable row level security;

revoke all on public.installation_settings, public.installation_access from public, anonymous, authenticated;
grant select on public.installation_settings to anonymous, authenticated;
grant select on public.installation_access to authenticated;
