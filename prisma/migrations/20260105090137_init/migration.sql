-- CreateTable
CREATE TABLE "blog_posts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "subtitle" TEXT,
    "status" TEXT,
    "markdown" TEXT,
    "markdown_ai_revision" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_publishing_recommendations" TEXT
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workflow" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT,
    "description" TEXT,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "email_verified" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "stock_analyses" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "csv_file_path" TEXT,
    "status" TEXT,
    "analysis_results" TEXT,
    "ai_insights" TEXT,
    "latest_price" REAL,
    "price_change" REAL,
    "price_change_percent" REAL,
    "price_updated_at" DATETIME,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "min_pct_change" REAL NOT NULL DEFAULT 4.0,
    "buy_price" REAL,
    "sell_price" REAL,
    "price_recommendations" TEXT
);

-- CreateTable
CREATE TABLE "daily_factor_data" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_analysis_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "close" REAL NOT NULL,
    "open" REAL,
    "high" REAL,
    "low" REAL,
    "volume" INTEGER,
    "pct_change" REAL,
    "ma20" REAL,
    "ma50" REAL,
    "ma200" REAL,
    "rsi" REAL,
    "volume_spike" BOOLEAN NOT NULL DEFAULT false,
    "market_up" BOOLEAN,
    "sector_up" BOOLEAN,
    "earnings_window" BOOLEAN,
    "break_ma50" BOOLEAN NOT NULL DEFAULT false,
    "break_ma200" BOOLEAN NOT NULL DEFAULT false,
    "rsi_over_60" BOOLEAN NOT NULL DEFAULT false,
    "news_positive" BOOLEAN,
    "short_covering" BOOLEAN,
    "macro_tailwind" BOOLEAN,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_factor_data_stock_analysis_id_fkey" FOREIGN KEY ("stock_analysis_id") REFERENCES "stock_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_scores" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_analysis_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "factor_count" INTEGER NOT NULL,
    "above_threshold" BOOLEAN NOT NULL DEFAULT false,
    "breakdown" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "daily_scores_stock_analysis_id_fkey" FOREIGN KEY ("stock_analysis_id") REFERENCES "stock_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "factor_tables" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stock_analysis_id" INTEGER NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "factor_data" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "factor_tables_stock_analysis_id_fkey" FOREIGN KEY ("stock_analysis_id") REFERENCES "stock_analyses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "earnings_data" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "company" TEXT,
    "earnings_date" DATETIME NOT NULL,
    "reportType" TEXT NOT NULL,
    "expected_eps" REAL,
    "actual_eps" REAL,
    "surprise" REAL,
    "revenue" REAL,
    "expected_revenue" REAL,
    "ai_summary" TEXT,
    "aiSentiment" TEXT,
    "aiKeyPoints" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "daily_factor_data_stock_analysis_id_date_key" ON "daily_factor_data"("stock_analysis_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_scores_stock_analysis_id_date_key" ON "daily_scores"("stock_analysis_id", "date");

-- CreateIndex
CREATE INDEX "factor_tables_stock_analysis_id_idx" ON "factor_tables"("stock_analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "factor_tables_stock_analysis_id_transaction_id_key" ON "factor_tables"("stock_analysis_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_data_symbol_earnings_date_key" ON "earnings_data"("symbol", "earnings_date");
