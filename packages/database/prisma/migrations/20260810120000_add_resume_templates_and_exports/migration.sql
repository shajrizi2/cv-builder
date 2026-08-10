CREATE TYPE "ResumeTemplate" AS ENUM ('classic', 'modern');
CREATE TYPE "ResumeExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "Resume"
ADD COLUMN "template" "ResumeTemplate" NOT NULL DEFAULT 'classic';

CREATE TABLE "ResumeExport" (
    "id" UUID NOT NULL,
    "resumeId" UUID NOT NULL,
    "template" "ResumeTemplate" NOT NULL,
    "resumeTitle" VARCHAR(200) NOT NULL,
    "resumeContent" JSONB NOT NULL,
    "status" "ResumeExportStatus" NOT NULL DEFAULT 'QUEUED',
    "processingToken" UUID,
    "objectKey" VARCHAR(512),
    "fileSize" INTEGER,
    "errorCode" VARCHAR(100),
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResumeExport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeExport_objectKey_key" ON "ResumeExport"("objectKey");
CREATE UNIQUE INDEX "ResumeExport_processingToken_key" ON "ResumeExport"("processingToken");
CREATE INDEX "ResumeExport_resumeId_createdAt_idx" ON "ResumeExport"("resumeId", "createdAt");
CREATE INDEX "ResumeExport_status_updatedAt_idx" ON "ResumeExport"("status", "updatedAt");
ALTER TABLE "ResumeExport" ADD CONSTRAINT "ResumeExport_resumeId_fkey"
FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
