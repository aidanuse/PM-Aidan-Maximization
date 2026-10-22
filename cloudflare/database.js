// Keep the domain store synchronous so inventory, ledger and reminders commit together.
// Durable Object storage supplies the transaction boundary; SQL BEGIN is unsupported.
export function durableDatabase(storage) {
  return {
    exec(query) {
      storage.sql.exec(query).toArray();
    },
    prepare(query) {
      return {
        get: (...bindings) => storage.sql.exec(query, ...bindings).toArray()[0],
        all: (...bindings) => storage.sql.exec(query, ...bindings).toArray(),
        run: (...bindings) => {
          const cursor = storage.sql.exec(query, ...bindings);
          cursor.toArray();
          // SQL changes() counts direct affected rows, unlike cursor.rowsWritten
          // which can include index maintenance and trigger writes.
          return { changes: storage.sql.exec("SELECT changes() AS n").one().n };
        },
      };
    },
    transaction: (callback) => storage.transactionSync(callback),
    close() {},
  };
}
