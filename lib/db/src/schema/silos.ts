import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shedGroupsTable } from "./shed_groups";

export const silosTable = pgTable("silos", {
  id: serial("id").primaryKey(),
  shedGroupId: integer("shed_group_id").references(() => shedGroupsTable.id, { onDelete: "cascade" }),
  letter: text("letter"),
  name: text("name").notNull(),
  defaultFeedType: text("default_feed_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSiloSchema = createInsertSchema(silosTable).omit({ id: true, createdAt: true });
export type InsertSilo = z.infer<typeof insertSiloSchema>;
export type Silo = typeof silosTable.$inferSelect;
