import pool from '../db/pool.js';

class TransactionService {
  async processTransaction(transactionData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const { client_transaction_id, client_id, session_id, operation, feature_data } = transactionData;

      const existingTransaction = await client.query(
        'SELECT id, status FROM sync_transactions WHERE client_transaction_id = $1',
        [client_transaction_id]
      );

      if (existingTransaction.rows.length > 0) {
        const existing = existingTransaction.rows[0];
        if (existing.status === 'completed') {
          await client.query('COMMIT');
          return { status: 'already_processed', transaction_id: existing.id };
        }
      }

      let featureId = feature_data.id;
      let result;

      switch (operation) {
        case 'create':
          result = await this._createFeature(client, feature_data, client_id, session_id);
          featureId = result.id;
          break;
        
        case 'update':
          result = await this._updateFeature(client, feature_data);
          break;
        
        case 'delete':
          result = await this._deleteFeature(client, feature_data.id);
          break;
        
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const transactionRecord = await client.query(
        `INSERT INTO sync_transactions 
         (client_transaction_id, client_id, session_id, operation, feature_id, feature_data, status, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (client_transaction_id) 
         DO UPDATE SET status = $7, processed_at = NOW()
         RETURNING id`,
        [client_transaction_id, client_id, session_id, operation, featureId, JSON.stringify(feature_data), 'completed']
      );

      await client.query(
        `INSERT INTO sync_state (client_id, last_sync_at, last_transaction_id)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (client_id)
         DO UPDATE SET last_sync_at = NOW(), last_transaction_id = $2`,
        [client_id, transactionRecord.rows[0].id]
      );

      await client.query('COMMIT');

      return {
        status: 'success',
        transaction_id: transactionRecord.rows[0].id,
        feature_id: featureId,
        feature: result
      };

    } catch (error) {
      await client.query('ROLLBACK');
      
      await this._logFailedTransaction(transactionData, error.message);
      
      throw error;
    } finally {
      client.release();
    }
  }

  async _createFeature(client, featureData, clientId, sessionId) {
    const { id, type, geometry, properties } = featureData;
    
    const geomText = this._geometryToWKT(geometry);
    
    const result = await client.query(
      `INSERT INTO electrical_features 
       (id, feature_type, geometry, properties, client_id, session_id, version)
       VALUES ($1, $2, ST_GeomFromText($3, 4326), $4, $5, $6, 1)
       RETURNING id, feature_type, ST_AsGeoJSON(geometry)::json as geometry, properties, version, created_at`,
      [id, type, geomText, JSON.stringify(properties || {}), clientId, sessionId]
    );

    return result.rows[0];
  }

  async _updateFeature(client, featureData) {
    const { id, geometry, properties } = featureData;
    
    const geomText = geometry ? this._geometryToWKT(geometry) : null;
    
    const result = await client.query(
      `UPDATE electrical_features 
       SET geometry = COALESCE(ST_GeomFromText($2, 4326), geometry),
           properties = COALESCE($3::jsonb, properties),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, feature_type, ST_AsGeoJSON(geometry)::json as geometry, properties, version, updated_at`,
      [id, geomText, properties ? JSON.stringify(properties) : null]
    );

    if (result.rows.length === 0) {
      throw new Error(`Feature ${id} not found or already deleted`);
    }

    return result.rows[0];
  }

  async _deleteFeature(client, featureId) {
    const result = await client.query(
      `UPDATE electrical_features 
       SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [featureId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Feature ${featureId} not found or already deleted`);
    }

    return result.rows[0];
  }

  async _logFailedTransaction(transactionData, errorMessage) {
    try {
      await pool.query(
        `INSERT INTO sync_transactions 
         (client_transaction_id, client_id, session_id, operation, feature_data, status, error_message, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
         ON CONFLICT (client_transaction_id) 
         DO UPDATE SET retry_count = sync_transactions.retry_count + 1, error_message = $7`,
        [
          transactionData.client_transaction_id,
          transactionData.client_id,
          transactionData.session_id,
          transactionData.operation,
          JSON.stringify(transactionData.feature_data),
          'failed',
          errorMessage
        ]
      );
    } catch (logError) {
      console.error('Failed to log transaction error:', logError);
    }
  }

  _geometryToWKT(geoJsonGeometry) {
    const { type, coordinates, radius } = geoJsonGeometry;
    
    switch (type) {
      case 'Point':
        return `POINT(${coordinates[0]} ${coordinates[1]})`;
      
      case 'LineString':
        const lineCoords = coordinates.map(c => `${c[0]} ${c[1]}`).join(', ');
        return `LINESTRING(${lineCoords})`;
      
      case 'Polygon':
        const rings = coordinates.map(ring => {
          const ringCoords = ring.map(c => `${c[0]} ${c[1]}`).join(', ');
          return `(${ringCoords})`;
        }).join(', ');
        return `POLYGON(${rings})`;
      
      case 'Circle':
        // Convertir le cercle en polygone avec approximation
        // coordinates = [lng, lat], radius en mètres
        const [centerLng, centerLat] = coordinates;
        const radiusInMeters = radius || 100;
        
        // Approximation : 1 degré ≈ 111,320 mètres à l'équateur
        // Ajuster pour la latitude
        const radiusInDegreesLat = radiusInMeters / 111320;
        const radiusInDegreesLng = radiusInMeters / (111320 * Math.cos(centerLat * Math.PI / 180));
        
        // Créer un polygone avec 32 points
        const numPoints = 32;
        const circlePoints = [];
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i * 2 * Math.PI) / numPoints;
          const lng = centerLng + radiusInDegreesLng * Math.cos(angle);
          const lat = centerLat + radiusInDegreesLat * Math.sin(angle);
          circlePoints.push(`${lng} ${lat}`);
        }
        
        return `POLYGON((${circlePoints.join(', ')}))`;
      
      default:
        throw new Error(`Unsupported geometry type: ${type}`);
    }
  }

  async processBatchTransactions(transactions) {
    const results = [];
    
    for (const transaction of transactions) {
      try {
        const result = await this.processTransaction(transaction);
        results.push({ ...result, client_transaction_id: transaction.client_transaction_id });
      } catch (error) {
        results.push({
          status: 'error',
          client_transaction_id: transaction.client_transaction_id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async getFeatures(clientId, bbox = null) {
    let query = `
      SELECT 
        id, 
        feature_type, 
        ST_AsGeoJSON(geometry)::json as geometry, 
        properties, 
        version,
        created_at,
        updated_at
      FROM electrical_features
      WHERE deleted_at IS NULL
    `;
    
    const params = [];
    
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      query += ` AND ST_Intersects(
        geometry, 
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )`;
      params.push(minLng, minLat, maxLng, maxLat);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  async getPendingTransactions(clientId) {
    const result = await pool.query(
      `SELECT * FROM sync_transactions 
       WHERE client_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [clientId]
    );
    
    return result.rows;
  }
}

export default new TransactionService();
