drop policy if exists "beta_rooms_select" on public.beta_rooms;

create policy "beta_rooms_select_owner_or_member"
on public.beta_rooms for select to authenticated
using (
  owner_id = auth.uid()
  or public.is_beta_room_member(id, auth.uid())
);

revoke select on public.beta_rooms from authenticated;
grant select (id, owner_id, name, description, created_at, updated_at) on public.beta_rooms to authenticated;
grant all on public.beta_rooms to service_role;