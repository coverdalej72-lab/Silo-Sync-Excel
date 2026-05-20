import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const farmsTable = pgTable("farms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  planTier: text("plan_tier").notNull().default("bronze"),
  clerkUserId: text("clerk_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFarmSchema = createInsertSchema(farmsTable).omit({ id: true, createdAt: true });
export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type Farm = typeof farmsTable.$inferSelect;
