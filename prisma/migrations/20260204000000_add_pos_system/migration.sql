-- Add new enums for POS system (drop if exists to ensure clean state)
DROP TYPE IF EXISTS "POSSaleStatus" CASCADE;
CREATE TYPE "POSSaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'VOIDED');

DROP TYPE IF EXISTS "POSPaymentStatus" CASCADE;
CREATE TYPE "POSPaymentStatus" AS ENUM ('SUCCESS', 'FAILED');

-- Drop old PosnetStatus if exists and recreate with new values
DROP TYPE IF EXISTS "PosnetStatus" CASCADE;
CREATE TYPE "PosnetStatus" AS ENUM ('OPEN', 'CONGESTED', 'CLOSED');

-- Drop old Posnet table if exists (was basic, needs full recreation)
DROP TABLE IF EXISTS "Transaction" CASCADE;
DROP TABLE IF EXISTS "Posnet" CASCADE;

-- Create new posnet table with all fields
CREATE TABLE "posnet" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PosnetStatus" NOT NULL DEFAULT 'CLOSED',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "traffic" INTEGER NOT NULL DEFAULT 0,
    "event_id" INTEGER NOT NULL,
    "bar_id" INTEGER NOT NULL,
    "auth_token" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posnet_pkey" PRIMARY KEY ("id")
);

-- Create unique index on posnet code
CREATE UNIQUE INDEX "posnet_code_key" ON "posnet"("code");

-- Create Transaction table (depends on posnet)
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posnetId" INTEGER NOT NULL,
    "orderId" INTEGER,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Transaction_orderId_key" ON "Transaction"("orderId");

-- Create POS Session table
CREATE TABLE "pos_session" (
    "id" SERIAL NOT NULL,
    "posnet_id" INTEGER NOT NULL,
    "opened_by_user_id" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_float" INTEGER,
    "closing_float" INTEGER,
    "notes" TEXT,

    CONSTRAINT "pos_session_pkey" PRIMARY KEY ("id")
);

-- Create POS Sale table
CREATE TABLE "pos_sale" (
    "id" SERIAL NOT NULL,
    "posnet_id" INTEGER NOT NULL,
    "session_id" INTEGER,
    "event_id" INTEGER NOT NULL,
    "bar_id" INTEGER NOT NULL,
    "cashier_user_id" INTEGER,
    "status" "POSSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_sale_idempotency_key_key" ON "pos_sale"("idempotency_key");

-- Create POS Sale Item table
CREATE TABLE "pos_sale_item" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "cocktail_id" INTEGER,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_price_snapshot" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "pos_sale_item_pkey" PRIMARY KEY ("id")
);

-- Create POS Payment table
CREATE TABLE "pos_payment" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "POSPaymentStatus" NOT NULL DEFAULT 'SUCCESS',
    "idempotency_key" TEXT,
    "external_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_payment_idempotency_key_key" ON "pos_payment"("idempotency_key");

-- Create Metric Sample table
CREATE TABLE "metric_sample" (
    "id" SERIAL NOT NULL,
    "posnet_id" INTEGER,
    "bar_id" INTEGER,
    "event_id" INTEGER NOT NULL,
    "metric_type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_sample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "metric_sample_event_id_metric_type_period_start_idx" ON "metric_sample"("event_id", "metric_type", "period_start");
CREATE INDEX "metric_sample_posnet_id_metric_type_period_start_idx" ON "metric_sample"("posnet_id", "metric_type", "period_start");

-- Add foreign key constraints for posnet
ALTER TABLE "posnet" ADD CONSTRAINT "posnet_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "posnet" ADD CONSTRAINT "posnet_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "Bar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for Transaction
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_posnetId_fkey" FOREIGN KEY ("posnetId") REFERENCES "posnet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key constraints for pos_session
ALTER TABLE "pos_session" ADD CONSTRAINT "pos_session_posnet_id_fkey" FOREIGN KEY ("posnet_id") REFERENCES "posnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_session" ADD CONSTRAINT "pos_session_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign key constraints for pos_sale
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_posnet_id_fkey" FOREIGN KEY ("posnet_id") REFERENCES "posnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pos_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "Bar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale" ADD CONSTRAINT "pos_sale_cashier_user_id_fkey" FOREIGN KEY ("cashier_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key constraints for pos_sale_item
ALTER TABLE "pos_sale_item" ADD CONSTRAINT "pos_sale_item_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "pos_sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for pos_payment
ALTER TABLE "pos_payment" ADD CONSTRAINT "pos_payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "pos_sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for metric_sample
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_posnet_id_fkey" FOREIGN KEY ("posnet_id") REFERENCES "posnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_bar_id_fkey" FOREIGN KEY ("bar_id") REFERENCES "Bar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_sample" ADD CONSTRAINT "metric_sample_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
