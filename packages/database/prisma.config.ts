import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generation and schema validation do not require a database connection.
    // Commands that access PostgreSQL report a clear error when this is empty.
    url: process.env.DATABASE_URL ?? '',
  },
});
