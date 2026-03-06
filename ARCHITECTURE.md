# 🏗️ Architecture Technique

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                    TABLETTE (React Native)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              WebView (Leaflet + Geoman)               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │  │
│  │  │ Marker  │ │  Line   │ │ Polygon │ │  Edit   │    │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘    │  │
│  │       └───────────┴───────────┴───────────┘          │  │
│  │                      │                                │  │
│  │              postMessage()                            │  │
│  └──────────────────────┼────────────────────────────────┘  │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Transaction Queue Manager                   │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  AsyncStorage (Persistent Queue)               │  │  │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │  │  │
│  │  │  │ TX1  │ │ TX2  │ │ TX3  │ │ TX4  │ ...      │  │  │
│  │  │  │ pend │ │ pend │ │ done │ │failed│          │  │  │
│  │  │  └──────┘ └──────┘ └──────┘ └──────┘          │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │           │ Auto-sync (2s interval)                  │  │
│  │           │ Batch upload (10 tx max)                 │  │
│  └───────────┼──────────────────────────────────────────┘  │
└─────────────┼──────────────────────────────────────────────┘
              │
              │ HTTP POST /api/sync
              │ (WiFi/4G)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVEUR (Node.js/Express)                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  API Routes                           │  │
│  │    /api/sync  |  /api/features  |  /api/pending      │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Transaction Service                      │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  1. Check idempotence (client_transaction_id)   │ │  │
│  │  │  2. BEGIN transaction                            │ │  │
│  │  │  3. Execute operation (CREATE/UPDATE/DELETE)     │ │  │
│  │  │  4. Log to sync_transactions                     │ │  │
│  │  │  5. Update sync_state                            │ │  │
│  │  │  6. COMMIT                                        │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────┬────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + PostGIS                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  electrical_features                                  │  │
│  │  ┌────────┬──────────────┬──────────┬─────────────┐  │  │
│  │  │   id   │ feature_type │ geometry │ properties  │  │  │
│  │  │  UUID  │   VARCHAR    │ PostGIS  │    JSONB    │  │  │
│  │  └────────┴──────────────┴──────────┴─────────────┘  │  │
│  │           │ GIST index on geometry                    │  │
│  └───────────┼───────────────────────────────────────────┘  │
│  ┌───────────▼───────────────────────────────────────────┐  │
│  │  sync_transactions (Audit trail)                      │  │
│  │  ┌────────┬──────────┬──────────┬────────┬────────┐  │  │
│  │  │ tx_id  │operation │feature_id│ status │  data  │  │  │
│  │  └────────┴──────────┴──────────┴────────┴────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Flux de données détaillé

### 1. Création d'une feature

```javascript
// ÉTAPE 1 : L'utilisateur dessine sur la carte (map.html)
map.on('pm:create', (e) => {
  const layer = e.layer;
  const featureId = generateFeatureId(); // UUID v4
  
  // ÉTAPE 2 : Envoi vers React Native via postMessage
  sendToReactNative({
    type: 'feature_created',
    data: {
      id: featureId,
      type: 'LineString',
      geometry: { type: 'LineString', coordinates: [[lng, lat], ...] },
      properties: { voltage: '220V', material: 'copper' }
    }
  });
});
```

```javascript
// ÉTAPE 3 : Réception dans App.js et mise en queue
const handleMessage = async (event) => {
  const message = JSON.parse(event.nativeEvent.data);
  
  if (message.type === 'feature_created') {
    // ÉTAPE 4 : Enqueue avec ID transaction unique
    await TransactionQueue.enqueue('create', message.data);
    // Sauvegardé dans AsyncStorage immédiatement
  }
};
```

```javascript
// ÉTAPE 5 : Auto-sync (toutes les 2 secondes)
async processQueue() {
  const batch = this.queue.filter(t => t.status === 'pending').slice(0, 10);
  
  // ÉTAPE 6 : POST vers serveur
  const response = await fetch(`${API_URL}/api/sync`, {
    method: 'POST',
    body: JSON.stringify({ 
      transactions: [
        {
          client_transaction_id: 'uuid-123',
          client_id: 'device-abc',
          session_id: 'session-xyz',
          operation: 'create',
          feature_data: { id, type, geometry, properties }
        }
      ]
    })
  });
  
  // ÉTAPE 7 : Traitement résultats
  // - success → retirer de la queue
  // - error → retry_count++
  // - already_processed → retirer (idempotence)
}
```

```javascript
// ÉTAPE 8 : Serveur traite la transaction (transactionService.js)
async processTransaction(transactionData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // ÉTAPE 9 : Vérifier idempotence
    const existing = await client.query(
      'SELECT id FROM sync_transactions WHERE client_transaction_id = $1',
      [client_transaction_id]
    );
    
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return { status: 'already_processed' };
    }
    
    // ÉTAPE 10 : Insérer dans electrical_features
    await client.query(`
      INSERT INTO electrical_features 
      (id, feature_type, geometry, properties)
      VALUES ($1, $2, ST_GeomFromText($3, 4326), $4)
    `, [id, type, geomWKT, properties]);
    
    // ÉTAPE 11 : Logger dans sync_transactions
    await client.query(`
      INSERT INTO sync_transactions
      (client_transaction_id, operation, feature_id, status)
      VALUES ($1, $2, $3, 'completed')
    `, [client_transaction_id, 'create', id]);
    
    await client.query('COMMIT');
    
    // ÉTAPE 12 : Retour au client
    return { status: 'success', feature_id: id };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

## Garanties du système

### 1. **ACID Compliance**
- **Atomicity** : Chaque transaction est complète ou annulée (BEGIN/COMMIT/ROLLBACK)
- **Consistency** : Les contraintes de la DB sont toujours respectées
- **Isolation** : Les transactions concurrentes ne s'interfèrent pas
- **Durability** : Une fois committed, les données persistent

### 2. **Idempotence**
```sql
-- Clé unique empêche les doublons
client_transaction_id VARCHAR(255) UNIQUE NOT NULL

-- Test avant insertion
SELECT id FROM sync_transactions 
WHERE client_transaction_id = 'uuid-123';
```

### 3. **Offline-First**
```javascript
// AsyncStorage sauvegarde avant envoi réseau
await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));

// Même si l'app crash, les transactions sont récupérées au redémarrage
await this.loadQueue();
```

### 4. **Retry Logic**
```javascript
if (syncResult.status === 'error') {
  transaction.retry_count += 1;
  
  if (transaction.retry_count > 5) {
    transaction.status = 'failed'; // Abandon après 5 tentatives
  }
}
```

### 5. **Soft Delete**
```sql
-- Jamais de DELETE, uniquement UPDATE
UPDATE electrical_features 
SET deleted_at = NOW()
WHERE id = $1;

-- Les requêtes filtrent
WHERE deleted_at IS NULL
```

## Performance et scalabilité

### Optimisations implémentées

1. **Batch Processing** : 10 transactions simultanées max
2. **Connection Pooling** : Pool PostgreSQL (max: 20 connexions)
3. **Spatial Indexing** : GIST index sur geometry
4. **JSONB** : Index GIN possible sur properties
5. **Compression** : gzip sur API responses

### Gestion de charge

```javascript
// Limite de taille payload
app.use(express.json({ limit: '10mb' }));

// Compression
app.use(compression());

// Rate limiting recommandé
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000 // 1000 requêtes max
});
app.use('/api/', limiter);
```

## Sécurité

### Implémenté
- ✅ Helmet.js (headers sécurisés)
- ✅ CORS configuré
- ✅ Prepared statements (injection SQL)
- ✅ Validation des géométries

### À ajouter (production)
- 🔲 JWT Authentication
- 🔲 Rate limiting
- 🔲 Input sanitization
- 🔲 HTTPS obligatoire
- 🔲 Audit logs
- 🔲 Role-based access control

## Monitoring et observabilité

### Logs recommandés

```javascript
// Winston logger
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log chaque transaction
logger.info('Transaction processed', {
  transaction_id,
  operation,
  duration_ms,
  client_id
});
```

### Métriques à surveiller

- Nombre de transactions/seconde
- Temps de réponse moyen
- Taux d'erreur par client
- Taille de la queue par client
- Utilisation CPU/RAM PostgreSQL
- Taille de la base de données

## Extension future

### Support multi-utilisateur

```sql
-- Ajouter user_id partout
ALTER TABLE electrical_features 
ADD COLUMN user_id UUID REFERENCES users(id);

-- Filtrer par permissions
SELECT * FROM electrical_features 
WHERE user_id = $1 OR (permissions @> '{"public": true}');
```

### Gestion de conflits

```sql
-- Versioning optimiste
UPDATE electrical_features 
SET geometry = $1, version = version + 1
WHERE id = $2 AND version = $3;

-- Si aucune ligne affectée → conflit détecté
```

### Sync bidirectionnelle

```javascript
// Client pull les changements serveur
GET /api/features/changes?since=2024-02-17T12:00:00Z

// Serveur push via WebSocket
io.on('connection', (socket) => {
  socket.on('subscribe', (bbox) => {
    // Notifier changements dans cette zone
  });
});
```

---

**Architecture conçue pour la robustesse et la performance terrain** 🏗️⚡
