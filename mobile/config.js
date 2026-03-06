export const API_CONFIG = {
  BASE_URL: __DEV__ ? 'http://10.0.2.2:3000' : 'https://your-production-api.com',
  SYNC_INTERVAL: 2000,
  MAX_RETRY_ATTEMPTS: 5,
  BATCH_SIZE: 10
};
