import 'dotenv/config';
import pg from 'pg';
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});
try {
  await client.connect();
  const tables = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name',
  );
  console.log(
    JSON.stringify({ tables: tables.rows.map((row) => row.table_name) }),
  );
  if (tables.rows.some((row) => row.table_name === 'lead')) {
    const counts = await client.query(
      'SELECT (SELECT count(*) FROM lead) AS leads, (SELECT count(*) FROM contrato) AS contratos, (SELECT count(*) FROM pago) AS pagos',
    );
    console.log(JSON.stringify(counts.rows[0]));
    const triggers = await client.query(
      "SELECT trigger_name FROM information_schema.triggers WHERE event_object_table IN ('lead','pago')",
    );
    console.log(JSON.stringify({ triggers: triggers.rows }));
    const cols = await client.query(
      "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_name IN ('pago','usuario_interno') ORDER BY table_name,ordinal_position",
    );
    console.log(JSON.stringify({ columns: cols.rows }));
  }
} catch (error) {
  console.error(
    'No se pudo inspeccionar PostgreSQL:',
    error.code || error.name,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
