-- CreateTable
CREATE TABLE "prediction_feedbacks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_analysis_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "is_correct" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "prediction_feedbacks_stock_analysis_id_fkey" FOREIGN KEY ("stock_analysis_id") REFERENCES "stock_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "prediction_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "prediction_feedbacks_stock_analysis_id_date_idx" ON "prediction_feedbacks"("stock_analysis_id", "date");

-- CreateIndex
CREATE INDEX "prediction_feedbacks_user_id_idx" ON "prediction_feedbacks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_feedbacks_stock_analysis_id_date_user_id_key" ON "prediction_feedbacks"("stock_analysis_id", "date", "user_id");
