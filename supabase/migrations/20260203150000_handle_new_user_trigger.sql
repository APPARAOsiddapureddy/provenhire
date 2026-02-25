-- Create user_roles and profiles when a new auth user signs up (fixes sign-up bug where role/profile were missing)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'jobseeker');
  IF user_role NOT IN ('recruiter', 'jobseeker', 'admin', 'expert_interviewer') THEN
    user_role := 'jobseeker';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role::public.app_role)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, email, company_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'company_name'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
