-- Drift Corner database schema
-- Run this in Supabase SQL Editor using the project owner account.
-- Never expose the Supabase service-role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'member' check (role in ('admin','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Other',
  size text,
  sku text unique,
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price > 0),
  notes text,
  status text not null default 'available' check (status in ('available','reserved','sold')),
  added_by uuid not null references public.profiles(id),
  reserved_by uuid references public.profiles(id),
  sold_by uuid references public.profiles(id),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sold_by uuid not null references public.profiles(id),
  total_amount numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  expenses numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  quantity integer not null default 1 check (quantity = 1),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null
);

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(email)
);

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and active=true); $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and active=true and role='admin'); $$;

-- First registered user becomes the initial admin. Subsequent signups are inactive
-- until invited/approved by the admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare invite_exists boolean;
begin
  select exists(select 1 from member_invites where email=lower(new.email) and accepted_at is null)
    into invite_exists;
  insert into public.profiles(id,email,full_name,role,active)
  values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    case when not exists(select 1 from profiles) then 'admin' else 'member' end,
    (not exists(select 1 from profiles)) or invite_exists);
  if invite_exists then
    update member_invites set accepted_at=now() where email=lower(new.email);
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.update_item_status_bulk(item_ids uuid[], new_status text)
returns integer language plpgsql security definer set search_path=public
as $$
declare changed integer;
begin
  if not public.is_active_member() then raise exception 'Active team membership required'; end if;
  if new_status not in ('available','reserved') then raise exception 'Invalid status'; end if;
  update inventory_items
  set status=new_status,
      reserved_by=case when new_status='reserved' then auth.uid() else null end,
      updated_at=now()
  where id=any(item_ids) and status in ('available','reserved');
  get diagnostics changed=row_count;
  return changed;
end; $$;

create or replace function public.sell_items_bulk(item_ids uuid[])
returns uuid language plpgsql security definer set search_path=public
as $$
declare sale_id uuid; total numeric(12,2); cost numeric(12,2); count_rows integer;
begin
  if not public.is_active_member() then raise exception 'Active team membership required'; end if;
  if coalesce(array_length(item_ids,1),0)=0 then raise exception 'Select at least one item'; end if;

  -- Lock selected rows. If any item is already sold or reserved, abort the entire sale.
  perform 1 from inventory_items where id=any(item_ids) for update;
  select count(*) into count_rows from inventory_items
    where id=any(item_ids) and status='available';
  if count_rows <> array_length(item_ids,1) then
    raise exception 'One or more items are no longer available. Refresh inventory and try again.';
  end if;

  select coalesce(sum(selling_price),0),coalesce(sum(cost_price),0)
    into total,cost from inventory_items where id=any(item_ids);

  insert into sales(sold_by,total_amount,total_cost)
    values(auth.uid(),total,cost) returning id into sale_id;

  insert into sale_lines(sale_id,item_id,quantity,unit_price,unit_cost)
    select sale_id,id,1,selling_price,cost_price from inventory_items where id=any(item_ids);

  update inventory_items set status='sold',sold_by=auth.uid(),sold_at=now(),reserved_by=null,updated_at=now()
    where id=any(item_ids);
  return sale_id;
end; $$;

create or replace function public.create_member_invite(invite_email text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'Only the admin can invite members'; end if;
  if invite_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email'; end if;
  insert into member_invites(email,invited_by) values(lower(invite_email),auth.uid())
  on conflict(email) do update set invited_by=excluded.invited_by,accepted_at=null,created_at=now()
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.remove_team_member(member_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can remove members'; end if;
  if member_id=auth.uid() then raise exception 'Admin cannot remove their own account'; end if;
  update profiles set active=false where id=member_id and role<>'admin';
  if not found then raise exception 'Member not found or cannot be removed'; end if;
end; $$;

alter table profiles enable row level security;
alter table inventory_items enable row level security;
alter table sales enable row level security;
alter table sale_lines enable row level security;
alter table member_invites enable row level security;
alter table business_expenses enable row level security;

create policy "profiles visible to active team" on profiles for select
using (public.is_active_member());
create policy "admin updates profiles" on profiles for update
using (public.is_admin()) with check (public.is_admin());

create policy "active members read inventory" on inventory_items for select
using (public.is_active_member());
create policy "members add inventory" on inventory_items for insert
with check (public.is_active_member() and added_by=auth.uid());
create policy "members edit inventory" on inventory_items for update
using (public.is_active_member()) with check (public.is_active_member());

create policy "active members read sales" on sales for select
using (public.is_active_member());
create policy "active members read sale lines" on sale_lines for select
using (public.is_active_member());
create policy "admin reads invites" on member_invites for select
using (public.is_admin());
create policy "active members read expenses" on business_expenses for select
using (public.is_active_member());
create policy "members add expenses" on business_expenses for insert
with check (public.is_active_member() and paid_by=auth.uid());

grant execute on function public.update_item_status_bulk(uuid[],text) to authenticated;
grant execute on function public.sell_items_bulk(uuid[]) to authenticated;
grant execute on function public.create_member_invite(text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;

alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.profiles;
