import pool from '../src/db/pool.js';

const clearAllData = async () => {
  try {
    console.log('🗑️  Suppression de TOUTES les données...\n');

    // 1. Supprimer toutes les features
    const featuresResult = await pool.query('DELETE FROM electrical_features');
    console.log(`✅ ${featuresResult.rowCount} features supprimées`);

    // 2. Supprimer toutes les transactions de sync
    const transactionsResult = await pool.query('DELETE FROM sync_transactions');
    console.log(`✅ ${transactionsResult.rowCount} transactions de sync supprimées`);

    // 3. Supprimer tous les états de sync
    const syncStateResult = await pool.query('DELETE FROM sync_state');
    console.log(`✅ ${syncStateResult.rowCount} états de sync supprimés`);

    console.log('\n🎉 Base de données complètement vide !');
    console.log('Vous pouvez recommencer à zéro.\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await pool.end();
    process.exit(1);
  }
};

clearAllData();
