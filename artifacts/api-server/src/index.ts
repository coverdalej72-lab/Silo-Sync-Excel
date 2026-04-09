import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import app from "./app";
import { logger } from "./lib/logger";
import { db, shedGroupsTable, silosTable } from "@workspace/db";
import { count } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedFarmData() {
  try {
    const [{ value: groupCount }] = await db.select({ value: count() }).from(shedGroupsTable);
    if (groupCount > 0) return;

    logger.info('Seeding shed groups and silos...');
    const sheds = [
      { name: "Sheds 1 & 2",   displayOrder: 1  },
      { name: "Sheds 3 & 4",   displayOrder: 2  },
      { name: "Sheds 5 & 6",   displayOrder: 3  },
      { name: "Sheds 7 & 8",   displayOrder: 4  },
      { name: "Sheds 9 & 10",  displayOrder: 5  },
      { name: "Sheds 11 & 12", displayOrder: 6  },
      { name: "Sheds 13 & 14", displayOrder: 7  },
      { name: "Sheds 15 & 16", displayOrder: 8  },
      { name: "Sheds 17 & 18", displayOrder: 9  },
      { name: "Sheds 19 & 20", displayOrder: 10 },
    ];

    const insertedGroups = await db.insert(shedGroupsTable).values(sheds).returning();

    const silos = insertedGroups.flatMap(g =>
      ["A", "B", "C"].map(letter => ({
        shedGroupId: g.id,
        letter,
        name: `Silo ${letter}`,
        defaultFeedType: null,
      }))
    );
    await db.insert(silosTable).values(silos);
    logger.info(`Seeded ${insertedGroups.length} shed groups with ${silos.length} silos`);
  } catch (err) {
    logger.error({ err }, 'Failed to seed farm data — server still starting');
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set — skipping Stripe init');
    return;
  }
  try {
    logger.info('Initializing Stripe schema...');
    await runMigrations({ databaseUrl, schema: 'stripe' });
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const webhookResult = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      logger.info({ url: webhookResult?.webhook?.url }, 'Stripe webhook configured');
    } catch (whErr: any) {
      logger.warn({ err: whErr.message }, 'Stripe webhook setup failed — continuing');
    }

    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe data synced'))
      .catch((err: any) => logger.error({ err }, 'Stripe backfill error'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Stripe — server still starting');
  }
}

await seedFarmData();
await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
