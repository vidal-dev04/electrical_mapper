export const API_CONFIG = {
  BASE_URL: __DEV__ ? 'http://192.168.1.4:3000' : 'https://electrical-network-backend.onrender.com',
  SYNC_INTERVAL: 2000,
  MAX_RETRY_ATTEMPTS: 5,
  BATCH_SIZE: 10
};
