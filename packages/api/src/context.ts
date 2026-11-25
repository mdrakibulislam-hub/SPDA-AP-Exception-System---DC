import type { Session } from "@SPDA-AP-Exception-System---DC/auth";
import type { Database } from "@SPDA-AP-Exception-System---DC/db";

export type Context = {
  session: Session | null;
  db: Database;
};
