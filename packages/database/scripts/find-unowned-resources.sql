-- Read-only CVB-023 legacy ownership audit. This intentionally returns only IDs
-- and timestamps; it does not expose CV content, filenames, or object keys.
SELECT 'Resume' AS "resourceType", "id", "createdAt"
FROM "Resume"
WHERE "ownerId" IS NULL
UNION ALL
SELECT 'ResumeImport' AS "resourceType", "id", "createdAt"
FROM "ResumeImport"
WHERE "ownerId" IS NULL
ORDER BY "createdAt";
