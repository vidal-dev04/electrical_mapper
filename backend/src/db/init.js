import pool from './pool.js';

const initDatabase = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    await client.query(`
      CREATE TABLE IF NOT EXISTS electrical_features (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        feature_type VARCHAR(50) NOT NULL,
        geometry GEOMETRY(Geometry, 4326) NOT NULL,
        properties JSONB DEFAULT '{}',
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        deleted_at TIMESTAMP WITH TIME ZONE,
        client_id VARCHAR(255),
        session_id VARCHAR(255)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_electrical_features_geometry 
      ON electrical_features USING GIST(geometry);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_electrical_features_type 
      ON electrical_features(feature_type);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_electrical_features_deleted 
      ON electrical_features(deleted_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_transaction_id VARCHAR(255) UNIQUE NOT NULL,
        client_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        operation VARCHAR(20) NOT NULL,
        feature_id UUID,
        feature_data JSONB,
        status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        retry_count INTEGER DEFAULT 0
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_transactions_client 
      ON sync_transactions(client_id, created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_transactions_status 
      ON sync_transactions(status, created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_state (
        client_id VARCHAR(255) PRIMARY KEY,
        last_sync_at TIMESTAMP WITH TIME ZONE,
        last_transaction_id UUID,
        pending_count INTEGER DEFAULT 0
      );
    `);

    await client.query('COMMIT');
    console.log('✅ Database initialized successfully with PostGIS extension');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};

initDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
