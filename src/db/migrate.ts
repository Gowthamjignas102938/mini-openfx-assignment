import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/**
 * Programmatic migration runner for production (Render's preDeployCommand).
 * Deliberately does NOT shell out to `drizzle-kit migrate` — drizzle-kit is a
 * devDependency and isn't installed in the production image. drizzle-orm's
 * own migrator only needs the already-generated SQL files under ./drizzle,
 * so it works with the same lean, --omit=dev runtime image `dist/main.js`
 * runs from. Safe to run on every deploy: already-applied migrations are
 * skipped (drizzle-orm tracks them in a __drizzle_migrations table).
 */
async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await db.$client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
