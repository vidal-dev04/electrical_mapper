# Electrical Network Mapper 🗺️⚡

Application mobile React Native pour la cartographie de réseaux électriques sur le terrain avec sauvegarde transactionnelle en temps réel.

## 🎯 Objectif

Créer des tracés du réseau électrique directement sur tablette avec synchronisation continue et gestion transactionnelle robuste, même en conditions de connectivité intermittente.

## 🏗️ Architecture

### Frontend (React Native + Leaflet Geoman)
- **WebView** intégrant Leaflet avec Geoman pour le dessin de cartes
- **Transaction Queue** pour la gestion asynchrone des modifications
- **Sauvegarde automatique** toutes les 2 secondes
- **Support offline** avec file d'attente persistante

### Backend (Node.js + Express)
- **API REST** pour la synchronisation
- **Gestion transactionnelle** avec PostgreSQL
- **Support batch** pour les mises à jour multiples
- **Idempotence** des requêtes (protection contre les doublons)

### Base de données (PostgreSQL + PostGIS)
- **Extension PostGIS** pour les données géographiques
- **Tables transactionnelles** pour la traçabilité
- **Indexes spatiaux** pour les performances
- **Support GeoJSON** natif

## 📦 Structure du projet

```
electrical-network-mapper/
├── backend/                    # Serveur Node.js
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.js        # Pool de connexions PostgreSQL
│   │   │   └── init.js        # Initialisation de la DB
│   │   ├── services/
│   │   │   └── transactionService.js  # Gestion transactionnelle
│   │   ├── routes/
│   │   │   └── features.js    # Endpoints API
│   │   └── server.js          # Point d'entrée
│   ├── package.json
│   └── .env.example
│
└── mobile/                     # Application React Native
    ├── services/
    │   └── TransactionQueue.js # File de transactions
    ├── assets/
    │   └── map.html           # Interface Leaflet Geoman
    ├── App.js                 # Composant principal
    ├── config.js              # Configuration
    └── package.json
```

## 🚀 Installation et démarrage

### 1. Prérequis

- Node.js 18+ et npm
- PostgreSQL 14+ avec extension PostGIS
- Expo CLI: `npm install -g expo-cli`
- Android Studio (pour émulateur Android) ou Xcode (pour iOS)

### 2. Configuration de la base de données

```bash
# Installer PostgreSQL et PostGIS
# Sur Windows avec PostgreSQL installer:
# Activer l'extension PostGIS via pgAdmin ou:

psql -U postgres
CREATE DATABASE electrical_network;
\c electrical_network
CREATE EXTENSION postgis;
```

### 3. Backend

```bash
cd backend

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres PostgreSQL

# Installer les dépendances
npm install

# Initialiser la base de données
npm run init-db

# Démarrer le serveur
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

### 4. Application mobile

```bash
cd mobile

# Installer les dépendances
npm install

# Démarrer l'application
npm start

# Puis choisir:
# - a pour Android
# - i pour iOS
# - w pour Web (dev uniquement)
```

## 🔧 Configuration

### Backend (.env)

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/electrical_network
PORT=3000
NODE_ENV=development
```

### Mobile (config.js)

```javascript
export const API_CONFIG = {
  BASE_URL: 'http://10.0.2.2:3000',  // Android emulator
  // BASE_URL: 'http://localhost:3000',  // iOS simulator
  SYNC_INTERVAL: 2000,
  MAX_RETRY_ATTEMPTS: 5
};
```

**Important**: Pour tester sur appareil physique, remplacer par l'IP locale de votre machine (ex: `http://192.168.1.100:3000`)

## 💾 Système de sauvegarde transactionnelle

### Fonctionnalités clés

1. **File d'attente persistante** (AsyncStorage)
   - Sauvegarde locale avant envoi au serveur
   - Survit aux redémarrages de l'app

2. **Synchronisation batch**
   - Envoie jusqu'à 10 transactions simultanément
   - Optimise la bande passante

3. **Idempotence**
   - Chaque transaction a un ID unique
   - Détection et déduplication automatique côté serveur

4. **Retry automatique**
   - Jusqu'à 5 tentatives par transaction
   - Backoff exponentiel en cas d'erreur

5. **États de transaction**
   - `pending`: En attente
   - `completed`: Réussie
   - `failed`: Échouée après 5 tentatives

### Workflow

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Dessin    │─────▶│ Queue locale │─────▶│   Serveur    │
│  sur carte  │      │ (AsyncStorage)│      │  PostgreSQL  │
└─────────────┘      └──────────────┘      └──────────────┘
                            │                       │
                            │   Auto-sync (2s)     │
                            └──────────────────────┘
```

## 🗺️ Utilisation de Leaflet Geoman

L'interface permet de dessiner:
- **Points** (markers): Poteaux électriques
- **Lignes** (polylines): Câbles et lignes
- **Polygones**: Zones de couverture
- **Rectangles**: Bâtiments/installations

### Contrôles disponibles

- ✏️ Dessiner (Point, Ligne, Polygone, Rectangle)
- ✂️ Modifier les formes existantes
- 🗑️ Supprimer
- ↩️ Annuler le dernier point (lors du dessin)

Chaque modification est automatiquement:
1. Enregistrée dans la file locale
2. Synchronisée avec le serveur
3. Sauvegardée dans PostgreSQL/PostGIS

## 📡 API Endpoints

### POST /api/sync
Synchronise un batch de transactions

```json
{
  "transactions": [
    {
      "client_transaction_id": "uuid",
      "client_id": "uuid",
      "session_id": "uuid",
      "operation": "create|update|delete",
      "feature_data": {
        "id": "uuid",
        "type": "Marker|Line|Polygon",
        "geometry": { "type": "Point", "coordinates": [lng, lat] },
        "properties": {}
      }
    }
  ]
}
```

### GET /api/features
Récupère les features existantes

```
Query params:
- client_id: UUID du client
- bbox: minLng,minLat,maxLng,maxLat (optionnel)
```

### GET /api/pending
Liste des transactions en attente

```
Query params:
- client_id: UUID du client
```

## 🔍 Schéma de base de données

### Table: electrical_features
```sql
- id: UUID (PK)
- feature_type: VARCHAR(50)
- geometry: GEOMETRY(Geometry, 4326) -- PostGIS
- properties: JSONB
- version: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
- deleted_at: TIMESTAMP (soft delete)
- client_id: VARCHAR(255)
- session_id: VARCHAR(255)
```

### Table: sync_transactions
```sql
- id: UUID (PK)
- client_transaction_id: VARCHAR(255) UNIQUE
- client_id: VARCHAR(255)
- session_id: VARCHAR(255)
- operation: VARCHAR(20)
- feature_id: UUID
- feature_data: JSONB
- status: VARCHAR(20)
- error_message: TEXT
- created_at: TIMESTAMP
- processed_at: TIMESTAMP
- retry_count: INTEGER
```

### Table: sync_state
```sql
- client_id: VARCHAR(255) (PK)
- last_sync_at: TIMESTAMP
- last_transaction_id: UUID
- pending_count: INTEGER
```

## 🎨 Interface utilisateur

### Indicateurs de synchronisation

- ✅ **Vert**: Tout est synchronisé
- ⏳ **Jaune**: Synchronisation en cours
- ⚠️ **Rouge**: Erreur de synchronisation

L'indicateur affiche le nombre de transactions en attente.

## 🛠️ Développement

### Tests recommandés

1. **Test de connectivité**
   - Activer/désactiver le réseau pendant le dessin
   - Vérifier que les modifications sont conservées

2. **Test de volume**
   - Dessiner rapidement plusieurs features
   - Vérifier la synchronisation batch

3. **Test de crash**
   - Fermer l'app pendant la synchronisation
   - Rouvrir et vérifier que rien n'est perdu

### Débogage

```javascript
// Dans TransactionQueue.js
console.log('Queue status:', TransactionQueue.getQueueStatus());
```

## 🚨 Résolution de problèmes

### L'app ne se connecte pas au serveur
- Vérifier l'URL dans `config.js`
- Pour Android emulator: utiliser `10.0.2.2` au lieu de `localhost`
- Pour appareil physique: utiliser l'IP locale

### Les transactions restent en attente
- Vérifier que le serveur backend est démarré
- Consulter les logs serveur pour les erreurs
- Vérifier la connexion PostgreSQL

### Erreurs PostGIS
```bash
# Réinstaller l'extension
psql -U postgres -d electrical_network
DROP EXTENSION IF EXISTS postgis CASCADE;
CREATE EXTENSION postgis;
```

## 📝 TODO / Améliorations futures

- [ ] Authentification utilisateur
- [ ] Gestion des conflits (édition simultanée)
- [ ] Export des données (GeoJSON, Shapefile)
- [ ] Mode complètement offline avec sync différée
- [ ] Photos/annotations sur les features
- [ ] Historique des modifications (audit trail)
- [ ] Filtres par type de feature
- [ ] Mesures de distance/surface

## 📄 Licence

MIT

## 👥 Support

Pour toute question ou problème:
1. Vérifier les logs serveur et client
2. Consulter la documentation Leaflet Geoman: https://geoman.io/docs/leaflet
3. Vérifier la configuration PostgreSQL/PostGIS

---

**Développé pour la cartographie terrain de réseaux électriques avec fiabilité maximale** ⚡🗺️
