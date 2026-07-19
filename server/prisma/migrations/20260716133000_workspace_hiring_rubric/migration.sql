ALTER TABLE "Workspace"
ADD COLUMN "targetRole" TEXT,
ADD COLUMN "hiringRubric" JSONB;

UPDATE "Workspace"
SET
  "targetRole" = 'Role not configured',
  "hiringRubric" = jsonb_build_object(
    'schemaVersion', 'workspace_hiring_rubric_v1',
    'responsibilities', jsonb_build_array(),
    'decisionPolicy', 'named_human_review_required',
    'migrationStatus', 'requires_configuration'
  )
WHERE "targetRole" IS NULL OR "hiringRubric" IS NULL;

ALTER TABLE "Workspace"
ALTER COLUMN "targetRole" SET NOT NULL,
ALTER COLUMN "hiringRubric" SET NOT NULL;
