-- AlterTable
ALTER TABLE "MaintenanceTask" ADD COLUMN     "safetyWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'template',
ADD COLUMN     "whyItMatters" TEXT;
