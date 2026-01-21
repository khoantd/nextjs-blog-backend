-- CreateTable
CREATE TABLE "predictions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_analysis_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "prediction" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "threshold" REAL NOT NULL,
    "above_threshold" INTEGER NOT NULL DEFAULT 0,
    "is_future" INTEGER NOT NULL DEFAULT 0,
    "active_factors" TEXT,
    "recommendations" TEXT,
    "interpretation" TEXT,
    "signals" TEXT,
    "patterns" TEXT,
    "price_data" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "predictions_stock_analysis_id_fkey" FOREIGN KEY ("stock_analysis_id") REFERENCES "stock_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prediction_feedbacks_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prediction_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "is_correct" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "prediction_feedbacks_new_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "prediction_feedbacks_new_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "predictions_stock_analysis_id_date_idx" ON "predictions"("stock_analysis_id", "date");

-- CreateIndex
CREATE INDEX "predictions_date_idx" ON "predictions"("date");

-- CreateIndex
CREATE INDEX "predictions_prediction_idx" ON "predictions"("prediction");

-- CreateIndex
CREATE UNIQUE INDEX "predictions_stock_analysis_id_date_key" ON "predictions"("stock_analysis_id", "date");

-- CreateIndex
CREATE INDEX "prediction_feedbacks_new_prediction_id_idx" ON "prediction_feedbacks_new"("prediction_id");

-- CreateIndex
CREATE INDEX "prediction_feedbacks_new_user_id_idx" ON "prediction_feedbacks_new"("user_id");

-- CreateIndex
CREATE INDEX "prediction_feedbacks_new_is_correct_idx" ON "prediction_feedbacks_new"("is_correct");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_feedbacks_new_prediction_id_user_id_key" ON "prediction_feedbacks_new"("prediction_id", "user_id");

-- Migrate existing feedbacks to new structure (if any exist)
-- Note: This will only work if predictions exist for the same stockAnalysisId + date
-- For existing feedbacks without matching predictions, they will need to be handled separately
INSERT INTO "prediction_feedbacks_new" ("user_id", "is_correct", "notes", "created_at", "updated_at", "prediction_id")
SELECT 
    pf."user_id",
    pf."is_correct",
    pf."notes",
    pf."created_at",
    pf."updated_at",
    p."id" as "prediction_id"
FROM "prediction_feedbacks" pf
INNER JOIN "predictions" p ON p."stock_analysis_id" = pf."stock_analysis_id" AND p."date" = pf."date"
WHERE EXISTS (
    SELECT 1 FROM "predictions" p2 
    WHERE p2."stock_analysis_id" = pf."stock_analysis_id" 
    AND p2."date" = pf."date"
);

-- Drop old table
DROP TABLE "prediction_feedbacks";

-- Rename new table
ALTER TABLE "prediction_feedbacks_new" RENAME TO "prediction_feedbacks";
