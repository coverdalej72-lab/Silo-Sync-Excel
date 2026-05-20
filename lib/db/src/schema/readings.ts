import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { silosTable } from "./silos";
import { farmsTable } from "./farms";

export const readingsTable = pgTable("readings", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id, { onDelete: "cascade" }),
  siloId: integer("silo_id").notNull().references(() => silosTable.id, { onDelete: "cascade" }),
  feedType: text("feed_type").notNull(),
  amountRemaining: numeric("amount_remaining", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("tons"),
  notes: text("notes"),
  readingDate: timestamp("reading_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReadingSchema = createInsertSchema(readingsTable).omit({ id: true, createdAt: true });
export type InsertReading = z.infer<typeof insertReadingSchema>;
export type Reading = typeof readingsTable.$inferSelect;
