import express from 'express';
import transactionService from '../services/transactionService.js';

const router = express.Router();

router.post('/sync', async (req, res) => {
  try {
    const { transactions } = req.body;
    
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid request: transactions array required' });
    }

    const results = await transactionService.processBatchTransactions(transactions);
    
    res.json({
      status: 'success',
      results,
      processed: results.length,
      failed: results.filter(r => r.status === 'error').length
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/features', async (req, res) => {
  try {
    const { client_id, bbox } = req.query;
    
    const bboxArray = bbox ? bbox.split(',').map(Number) : null;
    
    const features = await transactionService.getFeatures(client_id, bboxArray);
    
    res.json({
      type: 'FeatureCollection',
      features: features.map(f => ({
        type: 'Feature',
        id: f.id,
        geometry: f.geometry,
        properties: {
          ...f.properties,
          feature_type: f.feature_type,
          version: f.version,
          created_at: f.created_at,
          updated_at: f.updated_at
        }
      }))
    });

  } catch (error) {
    console.error('Get features error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const { client_id } = req.query;
    
    if (!client_id) {
      return res.status(400).json({ error: 'client_id required' });
    }
    
    const pending = await transactionService.getPendingTransactions(client_id);
    
    res.json({
      status: 'success',
      pending_count: pending.length,
      transactions: pending
    });

  } catch (error) {
    console.error('Get pending error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/transaction', async (req, res) => {
  try {
    const transactionData = req.body;
    
    const result = await transactionService.processTransaction(transactionData);
    
    res.json(result);

  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

export default router;
