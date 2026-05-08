-- Migration: add 'instapay' value to payment_method enum.
--
-- Instapay (Egyptian Instant Payment Network) is a bank-app push payment
-- distinct from card and bank-transfer rails — front-desk staff need to
-- record Instapay tahsilat (collection) explicitly so reconciliation against
-- the IPN settlement file works, and the booking engine needs it as a
-- selectable method when the property's Instapay provider is enabled.
--
-- drizzle-kit generate cannot run in this repo (CJS/.js extension issue —
-- see packages/database/src/push-schema.ts), so this migration is authored
-- by hand. push-schema.ts also reflects the same DDL idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_method'
      AND e.enumlabel = 'instapay'
  ) THEN
    ALTER TYPE payment_method ADD VALUE 'instapay';
  END IF;
END $$;
