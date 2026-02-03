drop policy if exists "Job seekers can view their verification stages" on public.verification_stages;
drop policy if exists "Job seekers can insert their verification stages" on public.verification_stages;
drop policy if exists "Job seekers can update their verification stages" on public.verification_stages;

create policy "Users can view their verification stages"
on public.verification_stages
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their verification stages"
on public.verification_stages
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their verification stages"
on public.verification_stages
for update
to authenticated
using (auth.uid() = user_id);
