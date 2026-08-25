import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't (re)generate AGENTS.md/CLAUDE.md on every `next dev` — this repo
  // manages its own docs.
  agentRules: false,
};

export default nextConfig;
