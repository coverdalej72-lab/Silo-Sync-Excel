import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const silosTable = pgTable("silos", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  defaultFeedType: text("default_feed_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiloSchema = createInsertSchema(silosTable).omit({ id: true, createdAt: true });
export type InsertSilo = z.infer<typeof insertSiloSchema>;
export type Silo = typeof silosTable.$inferSelect;
