import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp({ config });

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`ExileData API listening at ${address}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });

// Closing the app flushes usage counts that have not reached Postgres yet.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error(error);
        process.exit(1);
      }
    );
  });
}
