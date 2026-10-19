const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const sourcePath = path.resolve(
  process.env.KIWI_SOURCE_DB || path.join(__dirname, 'kiwibot.db')
);
const apiUrl = process.env.KIWI_API_URL?.replace(/\/+$/, '');
const sessionToken = process.env.KIWI_SESSION_TOKEN;
const batchSize = 100;

if (!apiUrl || !sessionToken) {
  throw new Error('Configure KIWI_API_URL e KIWI_SESSION_TOKEN antes de migrar os dados.');
}

const source = new DatabaseSync(sourcePath, { readOnly: true });
const opportunities = source.prepare('SELECT * FROM opportunities ORDER BY created_at, id').all();
const activities = source.prepare('SELECT * FROM activities ORDER BY created_at, id').all();
source.close();

async function migrate() {
  if (opportunities.length === 0) {
    console.log('O banco de origem não contém oportunidades para migrar.');
    return;
  }

  let imported = 0;
  for (let offset = 0; offset < opportunities.length; offset += batchSize) {
    const batch = opportunities.slice(offset, offset + batchSize);
    const sourceIds = new Set(batch.map(row => String(row.id)));
    const activityBatch = activities.filter(activity =>
      activity.opportunity_id && sourceIds.has(String(activity.opportunity_id))
    );
    const response = await fetch(`${apiUrl}/api/migration/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ opportunities: batch, activities: activityBatch })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(`Migração interrompida no lote ${Math.floor(offset / batchSize) + 1}: ${result.error || response.statusText}`);
    }
    imported += result.imported;
    console.log(`Lote concluído: ${Math.min(offset + batch.length, opportunities.length)}/${opportunities.length}`);
  }

  console.log(`Migração concluída: ${imported} oportunidades enviadas para a conta autenticada.`);
}

migrate().catch(error => {
  console.error('[migração] Falha:', error.message);
  process.exitCode = 1;
});
