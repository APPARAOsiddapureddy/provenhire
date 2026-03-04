 # Data Migration

This script imports Supabase exports into the new PostgreSQL schema.

## 1) Export data

Export the following tables from Supabase as JSON arrays:

- `users.json`
- `job_seeker_profiles.json`
- `recruiter_profiles.json`
- `interviews.json`
- `interview_messages.json`
- `resume_analyses.json`

Place the files in `server/migrations/`.

## 2) Run the migration script

From `server/`:

```
npm run migrate:legacy
```

Optional: set a custom directory and default password hash.

```
MIGRATION_DIR="/absolute/path/to/exports" \
MIGRATION_DEFAULT_PASSWORD="ChangeMe123!" \
npm run migrate:legacy
```

Users without a `password_hash` in the export receive `MIGRATION_DEFAULT_PASSWORD`.
