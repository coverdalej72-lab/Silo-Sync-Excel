import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const batchMetaTable = pgTable("batch_meta", {
  id: serial("id").primaryKey(),
  lastResetAt: timestamp("last_reset_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BatchMeta = typeof batchMetaTable.$inferSelect;
