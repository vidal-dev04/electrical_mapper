import pool from './src/db/pool.js';

const checkFeatures = async () => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        feature_type, 
        ST_AsGeoJSON(geometry) as geom,
        created_at
      FROM electrical_features 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`\n✅ ${result.rows.length} features dans la base:\n`);
    result.rows.forEach((row, i) => {
      console.log(`${i+1}. Feature ID: ${row.id}`);
      console.log(`   Type: ${row.feature_type}`);
      console.log(`   Créé: ${row.created_at}`);
      console.log(`   Géométrie: ${row.geom.substring(0, 100)}...\n`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await pool.end();
  }
};

checkFeatures();
