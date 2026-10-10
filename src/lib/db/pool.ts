import { Pool } from "pg";
import { pgConfig } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool(pgConfig());
  }
  return global.__pgPool;
}
