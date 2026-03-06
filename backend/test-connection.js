import pool from './src/db/pool.js';

const testConnection = async () => {
  try {
    console.log('🔍 Test de connexion à la base de données...\n');
    
    const result = await pool.query('SELECT NOW() as server_time, version() as pg_version, PostGIS_Version() as postgis_version');
    
    console.log('✅ Connexion réussie !\n');
    console.log('📅 Heure serveur:', result.rows[0].server_time);
    console.log('🐘 PostgreSQL:', result.rows[0].pg_version.split(' ')[0], result.rows[0].pg_version.split(' ')[1]);
    console.log('🗺️  PostGIS:', result.rows[0].postgis_version);
    
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('electrical_features', 'sync_transactions', 'sync_state')
    `);
    
    console.log('\n📊 Tables créées:', tableCheck.rows.length > 0 ? tableCheck.rows.map(r => r.table_name).join(', ') : 'Aucune (exécuter npm run init-db)');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur de connexion:', error.message);
    console.error('\n💡 Vérifiez:');
    console.error('   - DATABASE_URL dans .env est correcte');
    console.error('   - La base de données est accessible');
    console.error('   - PostGIS est installé (CREATE EXTENSION postgis;)');
    await pool.end();
    process.exit(1);
  }
};

testConnection();
