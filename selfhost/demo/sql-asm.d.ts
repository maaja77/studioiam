declare module 'sql.js/dist/sql-asm.js' {
  type Value = string | number | null | Uint8Array;
  interface Statement { bind(values: Value[]): boolean; step(): boolean; getAsObject(): Record<string, unknown>; free(): void }
  interface Database { run(sql: string, values?: Value[]): Database; exec(sql: string): unknown; prepare(sql: string): Statement; export(): Uint8Array; getRowsModified(): number }
  interface SqlJs { Database: new (data?: Uint8Array) => Database }
  export default function initSqlJs(): Promise<SqlJs>;
}
