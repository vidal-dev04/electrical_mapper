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

router.get('/html', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        feature_type,
        ST_X(ST_Centroid(geometry)) as longitude,
        ST_Y(ST_Centroid(geometry)) as latitude,
        properties->>'equipment_type' as equipment_type,
        properties->>'line_type' as line_type,
        properties->>'zone_status' as zone_status,
        properties->>'eq_section' as eq_section,
        properties->>'eq_voltage' as eq_voltage,
        properties->>'eq_owner' as eq_owner,
        properties->>'eq_status' as eq_status,
        properties->>'eq_notes' as eq_notes,
        properties->>'line_length' as line_length,
        properties->>'line_voltage' as line_voltage,
        properties->>'line_owner' as line_owner,
        properties->>'line_status' as line_status,
        properties->>'line_notes' as line_notes,
        properties->>'name' as name,
        properties->>'population' as population,
        properties->>'description' as description,
        created_at,
        updated_at
      FROM electrical_features
      ORDER BY created_at DESC
    `);

    const formatDate = (date) => {
      if (!date) return '-';
      return new Date(date).toLocaleString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const formatCoord = (coord) => {
      return coord ? parseFloat(coord).toFixed(5) : '-';
    };

    const getTypeLabel = (row) => {
      if (row.equipment_type) return `📍 ${row.equipment_type}`;
      if (row.line_type) return `━ ${row.line_type}`;
      if (row.zone_status) return `▭ Zone ${row.zone_status}`;
      return row.feature_type || '-';
    };

    const getGeometryIcon = (featureType) => {
      const icons = {
        'Marker': '📍',
        'Circle': '⭕',
        'Rectangle': '▭',
        'Polygon': '▲',
        'Line': '━'
      };
      return icons[featureType] || '○';
    };

    const getGeometryName = (featureType) => {
      const names = {
        'Marker': 'Marqueur',
        'Circle': 'Cercle',
        'Rectangle': 'Rectangle',
        'Polygon': 'Polygone',
        'Line': 'Ligne'
      };
      return names[featureType] || featureType;
    };

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Export Réseau Électrique</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 16px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    .stats {
      background: white;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .stats h2 {
      font-size: 18px;
      color: #333;
      margin-bottom: 12px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    }
    .stat-item {
      background: #f8f9fa;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #2196F3;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
    }
    .stat-value {
      font-size: 20px;
      font-weight: bold;
      color: #2196F3;
    }
    .table-container {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: #2196F3;
      color: white;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    th {
      padding: 12px 8px;
      text-align: left;
      font-size: 13px;
      font-weight: 600;
    }
    td {
      padding: 12px 8px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .type-marker { color: #9C27B0; }
    .type-line { color: #4CAF50; }
    .type-zone { color: #FF9800; }
    .geometry-type {
      font-weight: 600;
      color: #2196F3;
      white-space: nowrap;
    }
    .details {
      font-size: 12px;
      line-height: 1.5;
      max-width: 300px;
    }
    .details strong {
      color: #333;
      font-weight: 600;
    }
    .coord {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #666;
      white-space: nowrap;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 12px;
    }
    @media (max-width: 768px) {
      body { padding: 8px; }
      .header h1 { font-size: 20px; }
      th, td { padding: 8px 4px; font-size: 11px; }
      .stat-value { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Réseau Électrique</h1>
    <p>Export des données - ${formatDate(new Date())}</p>
  </div>

  <div class="stats">
    <h2>📈 Statistiques</h2>
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-label">Total</div>
        <div class="stat-value">${result.rows.length}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">📍 Équipements</div>
        <div class="stat-value">${result.rows.filter(r => r.equipment_type).length}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">━ Lignes</div>
        <div class="stat-value">${result.rows.filter(r => r.line_type).length}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">▭ Zones</div>
        <div class="stat-value">${result.rows.filter(r => r.zone_status).length}</div>
      </div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Forme</th>
          <th>Type</th>
          <th>Détails</th>
          <th>Coordonnées</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${result.rows.map(row => {
          // Construire les détails selon le type
          let details = '';
          
          if (row.equipment_type) {
            // Pour les équipements
            details = `
              ${row.eq_section ? `<strong>Section:</strong> ${row.eq_section}<br>` : ''}
              ${row.eq_voltage ? `<strong>Tension:</strong> ${row.eq_voltage} V<br>` : ''}
              ${row.eq_owner ? `<strong>Propriétaire:</strong> ${row.eq_owner}<br>` : ''}
              ${row.eq_status ? `<strong>État:</strong> ${row.eq_status}<br>` : ''}
              ${row.eq_notes ? `<strong>Notes:</strong> ${row.eq_notes}` : ''}
            `;
          } else if (row.line_type) {
            // Pour les lignes
            details = `
              ${row.line_length ? `<strong>Longueur:</strong> ${row.line_length} m<br>` : ''}
              ${row.line_voltage ? `<strong>Tension:</strong> ${row.line_voltage} V<br>` : ''}
              ${row.line_owner ? `<strong>Propriétaire:</strong> ${row.line_owner}<br>` : ''}
              ${row.line_status ? `<strong>État:</strong> ${row.line_status}<br>` : ''}
              ${row.line_notes ? `<strong>Notes:</strong> ${row.line_notes}` : ''}
            `;
          } else if (row.zone_status) {
            // Pour les zones
            details = `
              ${row.name ? `<strong>Nom:</strong> ${row.name}<br>` : ''}
              ${row.population ? `<strong>Population:</strong> ${row.population}<br>` : ''}
              ${row.description ? `<strong>Description:</strong> ${row.description}` : ''}
            `;
          }
          
          // Nettoyer les détails vides
          details = details.trim() || '-';
          
          return `
          <tr>
            <td class="geometry-type">${getGeometryIcon(row.feature_type)} ${getGeometryName(row.feature_type)}</td>
            <td class="${row.equipment_type ? 'type-marker' : row.line_type ? 'type-line' : 'type-zone'}">${getTypeLabel(row)}</td>
            <td class="details">${details}</td>
            <td class="coord">${formatCoord(row.latitude)}, ${formatCoord(row.longitude)}</td>
            <td>${formatDate(row.created_at)}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Généré par l'application Réseau Électrique
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('HTML export error:', error);
    res.status(500).json({ error: 'Failed to export HTML' });
  }
});

export default router;
