import { createAuth } from "@SPDA-AP-Exception-System---DC/auth";
import { createDb } from "@SPDA-AP-Exception-System---DC/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
