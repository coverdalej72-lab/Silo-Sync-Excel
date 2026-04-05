import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { shedGroupsTable } from "./shed_groups";
import { silosTable } from "./silos";

export const deliveriesTable = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  shedGroupId: integer("shed_group_id").references(() => shedGroupsTable.id, { onDelete: "set null" }),
  siloId: integer("silo_id").references(() => silosTable.id, { onDelete: "set null" }),
  feedType: text("feed_type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("tons"),
  notes: text("notes"),
  deliveryDate: timestamp("delivery_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDeliverySchema = createInsertSchema(deliveriesTable).omit({ id: true, createdAt: true });
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;
export type Delivery = typeof deliveriesTable.$inferSelect;
