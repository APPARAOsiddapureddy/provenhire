drop policy if exists "Job seekers can view their own profile" on public.job_seeker_profiles;
drop policy if exists "Job seekers can insert their own profile" on public.job_seeker_profiles;
drop policy if exists "Job seekers can update their own profile" on public.job_seeker_profiles;

create policy "Users can view their own profile"
on public.job_seeker_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own profile"
on public.job_seeker_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own profile"
on public.job_seeker_profiles
for update
to authenticated
using (auth.uid() = user_id);
