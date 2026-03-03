import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { FastifyInstance } from "fastify";
import { config } from "../config";

export default fp(async (fastify: FastifyInstance) => {
  const allowlist = new Set(config.corsOrigins);
  const allowAll = config.nodeEnv !== "production" && allowlist.size === 0;

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowAll || allowlist.has("*")) return cb(null, true);
      if (allowlist.has(origin)) return cb(null, true);
      return cb(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
});
