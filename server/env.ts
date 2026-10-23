import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.string().default("file:./data/daily-grace.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  BIBLE_API_KEY: z.string().optional(),
  BIBLE_API_BIBLE_ID: z.string().optional(),
  REVENUECAT_WEBHOOK_AUTH: z.string().optional(),
  REVENUECAT_SECRET_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:8081"),
});

const parsed = EnvSchema.parse(process.env);

if (parsed.NODE_ENV === "production" && !parsed.JWT_SECRET) {
  throw new Error("JWT_SECRET (32+ characters) is required in production");
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? "dev-only-insecure-secret-change-me-0123456789",
};
