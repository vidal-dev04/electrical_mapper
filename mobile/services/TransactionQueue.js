import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

const QUEUE_KEY = '@transaction_queue';
const SYNC_INTERVAL = 2000;

class TransactionQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.syncInterval = null;
    this.listeners = [];
    this.clientId = null;
    this.sessionId = null;
  }

  async initialize(clientId, sessionId) {
    this.clientId = clientId;
    this.sessionId = sessionId;
    await this.loadQueue();
    this.startAutoSync();
  }

  async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`📦 Loaded ${this.queue.length} transactions from storage`);
      }
    } catch (error) {
      console.error('Failed to load queue:', error);
    }
  }

  async saveQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save queue:', error);
    }
  }

  async enqueue(operation, featureData) {
    const transaction = {
      client_transaction_id: uuid.v4(),
      client_id: this.clientId,
      session_id: this.sessionId,
      operation,
      feature_data: featureData,
      timestamp: new Date().toISOString(),
      retry_count: 0,
      status: 'pending'
    };

    this.queue.push(transaction);
    await this.saveQueue();
    
    this.notifyListeners({
      type: 'queue_updated',
      queue_length: this.queue.length
    });

    console.log(`➕ Enqueued ${operation} transaction:`, transaction.client_transaction_id);

    if (!this.processing) {
      this.processQueue();
    }

    return transaction.client_transaction_id;
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.notifyListeners({ type: 'sync_started' });

    try {
      const batch = this.queue.filter(t => t.status === 'pending').slice(0, 10);
      
      if (batch.length === 0) {
        this.processing = false;
        return;
      }

      console.log(`🔄 Processing batch of ${batch.length} transactions`);

      const response = await fetch(`${this.getApiUrl()}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: batch }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      for (const syncResult of result.results) {
        const queueIndex = this.queue.findIndex(
          t => t.client_transaction_id === syncResult.client_transaction_id
        );

        if (queueIndex !== -1) {
          if (syncResult.status === 'success' || syncResult.status === 'already_processed') {
            this.queue.splice(queueIndex, 1);
            console.log(`✅ Transaction completed:`, syncResult.client_transaction_id);
          } else if (syncResult.status === 'error') {
            this.queue[queueIndex].retry_count += 1;
            this.queue[queueIndex].last_error = syncResult.error;
            
            if (this.queue[queueIndex].retry_count > 5) {
              this.queue[queueIndex].status = 'failed';
              console.error(`❌ Transaction failed permanently:`, syncResult.client_transaction_id);
            }
          }
        }
      }

      await this.saveQueue();
      
      this.notifyListeners({
        type: 'sync_completed',
        processed: result.processed,
        failed: result.failed,
        queue_length: this.queue.length
      });

      if (this.queue.filter(t => t.status === 'pending').length > 0) {
        setTimeout(() => this.processQueue(), 500);
      }

    } catch (error) {
      console.error('Queue processing error:', error);
      
      this.notifyListeners({
        type: 'sync_error',
        error: error.message
      });

      setTimeout(() => {
        this.processing = false;
        this.processQueue();
      }, 5000);
      
    } finally {
      this.processing = false;
    }
  }

  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (!this.processing && this.queue.length > 0) {
        this.processQueue();
      }
    }, SYNC_INTERVAL);

    console.log('⏰ Auto-sync started');
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏸️  Auto-sync stopped');
    }
  }

  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners(event) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  getApiUrl() {
    return 'http://192.168.1.6:3000';
  }

  getQueueStatus() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(t => t.status === 'pending').length,
      failed: this.queue.filter(t => t.status === 'failed').length,
      processing: this.processing
    };
  }

  async clearQueue() {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners({ type: 'queue_cleared' });
  }
}

export default new TransactionQueue();
