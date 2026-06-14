import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthContext } from "@sever/contracts";

// The shape every module exposes to the host. `service` is the module's public
// contract (consumed by other modules); `routes` registers its HTTP surface;
// `migration` is the SQL that creates its own schema. Anything else in the
// module folder is private and must not be imported across module boundaries
// (enforced by dependency-cruiser in CI).

export interface RouteContext {
  /** Resolve the authenticated caller for the current request. */
  auth: (req: FastifyRequest) => Promise<AuthContext>;
}

export interface SeverModule<Service> {
  name: string;
  /** Idempotent DDL that owns this module's Postgres schema. */
  migration: string;
  service: Service;
  registerRoutes: (app: FastifyInstance, ctx: RouteContext) => void;
}
