import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { farmsTable } from "./farms";

export const shedGroupsTable = pgTable("shed_groups", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const insertShedGroupSchema = createInsertSchema(shedGroupsTable).omit({ id: true });
export type InsertShedGroup = z.infer<typeof insertShedGroupSchema>;
export type ShedGroup = typeof shedGroupsTable.$inferSelect;
