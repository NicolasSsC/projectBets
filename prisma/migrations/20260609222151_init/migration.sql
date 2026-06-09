-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoff" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled'
);

-- CreateTable
CREATE TABLE "MarketOdds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "line" REAL NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketOdds_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "line" REAL NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "stake" INTEGER NOT NULL,
    "edge" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "profit" INTEGER NOT NULL DEFAULT 0,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "Bet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankrollSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "balance" INTEGER NOT NULL,
    "note" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOdds_matchId_source_market_line_outcome_key" ON "MarketOdds"("matchId", "source", "market", "line", "outcome");
