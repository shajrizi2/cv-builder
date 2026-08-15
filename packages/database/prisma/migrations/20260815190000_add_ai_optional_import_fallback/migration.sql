-- CVB-024: distinguish successful import modes and retain bounded fallback source text.
CREATE TYPE "ResumeImportMode" AS ENUM ('AI_MAPPED', 'MANUAL_FALLBACK');

ALTER TABLE "ResumeImport"
  ALTER COLUMN "objectKey" DROP NOT NULL,
  ADD COLUMN "completionMode" "ResumeImportMode",
  ADD COLUMN "extractedText" TEXT;
