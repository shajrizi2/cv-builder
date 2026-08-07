CREATE TYPE "ResumeImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ResumeImport" (
    "id" UUID NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "status" "ResumeImportStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" VARCHAR(100),
    "errorMessage" VARCHAR(500),
    "resumeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResumeImport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeImport_objectKey_key" ON "ResumeImport"("objectKey");
CREATE UNIQUE INDEX "ResumeImport_resumeId_key" ON "ResumeImport"("resumeId");
CREATE INDEX "ResumeImport_createdAt_idx" ON "ResumeImport"("createdAt");
CREATE INDEX "ResumeImport_status_updatedAt_idx" ON "ResumeImport"("status", "updatedAt");
ALTER TABLE "ResumeImport" ADD CONSTRAINT "ResumeImport_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
