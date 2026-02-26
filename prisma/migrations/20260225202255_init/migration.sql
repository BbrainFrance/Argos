-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'ANALYST');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('AIRCRAFT', 'VESSEL');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'DANGER', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('SQUAWK', 'MILITARY', 'ANOMALY', 'GEOFENCE', 'PATTERN', 'PROXIMITY');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('SURVEILLANCE', 'EXCLUSION', 'ALERT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ANALYST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_entities" (
    "id" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "tracked" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "alt" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertSeverity" NOT NULL,
    "category" "AlertCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityId" TEXT,
    "zoneId" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "polygon" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8b5cf6',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "alertOnEntry" BOOLEAN NOT NULL DEFAULT false,
    "alertOnExit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tracked_entities_type_idx" ON "tracked_entities"("type");

-- CreateIndex
CREATE INDEX "tracked_entities_tracked_idx" ON "tracked_entities"("tracked");

-- CreateIndex
CREATE INDEX "tracked_entities_flagged_idx" ON "tracked_entities"("flagged");

-- CreateIndex
CREATE INDEX "positions_entityId_timestamp_idx" ON "positions"("entityId", "timestamp");

-- CreateIndex
CREATE INDEX "positions_timestamp_idx" ON "positions"("timestamp");

-- CreateIndex
CREATE INDEX "alerts_timestamp_idx" ON "alerts"("timestamp");

-- CreateIndex
CREATE INDEX "alerts_entityId_idx" ON "alerts"("entityId");

-- CreateIndex
CREATE INDEX "alerts_category_idx" ON "alerts"("category");

-- CreateIndex
CREATE INDEX "alerts_type_idx" ON "alerts"("type");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "tracked_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "tracked_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
