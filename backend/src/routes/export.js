import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

router.get('/geojson', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        feature_type,
        ST_AsGeoJSON(geometry) as geometry,
        properties,
        created_at,
        updated_at
      FROM electrical_features
      ORDER BY created_at DESC
    `);

    const features = result.rows.map(row => ({
      type: 'Feature',
      id: row.id,
      geometry: JSON.parse(row.geometry),
      properties: {
        ...row.properties,
        feature_type: row.feature_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    }));

    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    res.json(geojson);
  } catch (error) {
    console.error('GeoJSON export error:', error);
    res.status(500).json({ error: 'Failed to export GeoJSON' });
  }
});

router.get('/csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        feature_type,
        ST_AsText(geometry) as geometry_wkt,
        ST_X(ST_Centroid(geometry)) as longitude,
        ST_Y(ST_Centroid(geometry)) as latitude,
        properties->>'equipment_type' as equipment_type,
        properties->>'voltage' as voltage,
        properties->>'owner' as owner,
        properties->>'status' as status,
        properties->>'notes' as notes,
        created_at,
        updated_at
      FROM electrical_features
      ORDER BY created_at DESC
    `);

    const headers = [
      'ID',
      'Type Feature',
      'Type Equipement',
      'Tension (V)',
      'Proprietaire',
      'Etat',
      'Latitude',
      'Longitude',
      'Geometrie WKT',
      'Notes',
      'Date Creation',
      'Date Modification'
    ];

    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      const values = [
        row.id,
        row.feature_type || '',
        row.equipment_type || '',
        row.voltage || '',
        row.owner || '',
        row.status || '',
        row.latitude || '',
        row.longitude || '',
        `"${(row.geometry_wkt || '').replace(/"/g, '""')}"`,
        `"${(row.notes || '').replace(/"/g, '""')}"`,
        row.created_at || '',
        row.updated_at || ''
      ];
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=electrical-network-export.csv');
    res.send('\ufeff' + csv); // UTF-8 BOM for Excel
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

export default router;
