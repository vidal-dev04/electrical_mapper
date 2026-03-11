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
    if (this.processing) {
      return;
    }

    const batch = this.queue.filter(t => t.status === 'pending').slice(0, 10);
    
    if (batch.length === 0) {
      return; // No pending transactions, exit early
    }

    this.processing = true;
    this.notifyListeners({ type: 'sync_started' });

    try {
      console.log(`🔄 Processing batch of ${batch.length} transactions`);
      console.log(`📡 Fetching: ${this.getApiUrl()}/api/sync`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${this.getApiUrl()}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: batch }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log(`✅ Response received: ${response.status}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const successfulTransactions = [];

      for (const syncResult of result.results) {
        const queueIndex = this.queue.findIndex(
          t => t.client_transaction_id === syncResult.client_transaction_id
        );

        if (queueIndex !== -1) {
          if (syncResult.status === 'success' || syncResult.status === 'already_processed') {
            const txn = this.queue[queueIndex];
            successfulTransactions.push({
              operation: txn.operation,
              feature_id: txn.feature_data.id
            });
            this.queue.splice(queueIndex, 1);
            console.log(`✅ Transaction completed:`, syncResult.client_transaction_id);
          } else if (syncResult.status === 'error') {
            this.queue[queueIndex].retry_count += 1;
            this.queue[queueIndex].last_error = syncResult.error;
            
            console.error(`⚠️ Transaction error (attempt ${this.queue[queueIndex].retry_count}/5):`, syncResult.client_transaction_id);
            console.error(`Error details:`, syncResult.error);
            console.error(`Transaction data:`, JSON.stringify(this.queue[queueIndex], null, 2));
            
            // Si c'est une erreur de clé dupliquée sur un create, convertir en update
            if (syncResult.error && syncResult.error.includes('duplicate key') && this.queue[queueIndex].operation === 'create') {
              console.log(`🔄 Converting failed create to update for feature ${this.queue[queueIndex].feature_data.id}`);
              this.queue[queueIndex].operation = 'update';
              this.queue[queueIndex].retry_count = 0; // Reset retry count
              this.queue[queueIndex].status = 'pending';
              
              // Notifier que cette feature existe en base
              successfulTransactions.push({
                operation: 'create',
                feature_id: this.queue[queueIndex].feature_data.id
              });
            } else if (this.queue[queueIndex].retry_count > 5) {
              console.error(`❌ Transaction failed permanently:`, syncResult.client_transaction_id);
              console.error(`Final error:`, syncResult.error);
              // Remove permanently failed transactions from queue
              this.queue.splice(queueIndex, 1);
            } else {
              this.queue[queueIndex].status = 'pending';
            }
          }
        }
      }

      await this.saveQueue();
      
      this.notifyListeners({
        type: 'sync_completed',
        processed: result.processed,
        failed: result.failed,
        queue_length: this.queue.length,
        successfulTransactions
      });

      if (this.queue.filter(t => t.status === 'pending').length > 0) {
        setTimeout(() => this.processQueue(), 500);
      }

    } catch (error) {
      console.error('❌ Queue processing error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      this.processing = false;
      
      this.notifyListeners({
        type: 'sync_error',
        error: error.message,
        queue_length: this.queue.length
      });
      
      setTimeout(() => this.processQueue(), 5000);
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
  const isDevelopment = __DEV__; // React Native détecte automatiquement
  
  if (isDevelopment) {
    return 'http://192.168.1.4:3000'; // Local pour tests
  } else {
    return 'https://electrical-network-backend.onrender.com'; // Production
  }
}

  getQueueStatus() {
    return {
      total: this.queue.length,
      pending: this.queue.filter(t => t.status === 'pending').length,
      failed: this.queue.filter(t => t.status === 'failed').length,
      processing: this.processing
    };
  }

  async clearFailedTransactions() {
    console.log('🧹 Clearing failed transactions...');
    const failedCount = this.queue.filter(t => t.status === 'failed').length;
    this.queue = this.queue.filter(t => t.status !== 'failed');
    await this.saveQueue();
    console.log(`✅ Removed ${failedCount} failed transactions`);
    return failedCount;
  }

  logQueueState() {
    console.log('📊 Queue State:');
    console.log(`Total: ${this.queue.length}`);
    console.log(`Pending: ${this.queue.filter(t => t.status === 'pending').length}`);
    console.log(`Failed: ${this.queue.filter(t => t.status === 'failed').length}`);
    this.queue.forEach((t, i) => {
      console.log(`${i+1}. ${t.operation} - ${t.status} - retry:${t.retry_count} - ${t.client_transaction_id}`);
    });
  }
}

export default new TransactionQueue();
