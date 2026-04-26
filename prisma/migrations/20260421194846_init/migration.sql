-- CreateTable
CREATE TABLE "Tour" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "tourType" TEXT NOT NULL,
    "tourKind" TEXT NOT NULL,
    "paxCount" INTEGER,
    "hotelPickup" BOOLEAN NOT NULL DEFAULT false,
    "fiveStarReviews" INTEGER NOT NULL DEFAULT 0,
    "cancellationWithin48h" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "clientName" TEXT NOT NULL DEFAULT '',
    "clientAddress" TEXT NOT NULL DEFAULT '',
    "clientCity" TEXT NOT NULL DEFAULT '',
    "clientEmail" TEXT NOT NULL DEFAULT '',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'RE',
    "paymentDays" INTEGER NOT NULL DEFAULT 14,
    "n8nWebhookUrl" TEXT NOT NULL DEFAULT ''
);
