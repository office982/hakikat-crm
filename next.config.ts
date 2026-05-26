import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The migration runner (src/lib/migrate.ts) reads .sql files from this
  // directory at boot. Standalone mode only bundles statically-traced files,
  // so we have to include the SQL files explicitly.
  outputFileTracingIncludes: {
    "/**/*": ["./supabase/migrations/**/*.sql"],
  },
};

export default nextConfig;
