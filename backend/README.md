# Backend - Electrical Network Mapper API

API Node.js/Express avec gestion transactionnelle pour la synchronisation de données géographiques.

## Démarrage rapide

```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Éditer .env avec vos paramètres

# Initialisation base de données
npm run init-db

# Démarrage développement
npm run dev

# Démarrage production
npm start
```

## Endpoints

### POST /api/sync
Synchronise un batch de transactions avec garantie ACID.

### GET /api/features
Récupère les features avec filtrage spatial optionnel.

### GET /api/pending
Liste les transactions en attente pour un client.

### POST /api/transaction
Traite une transaction unique (fallback).

### GET /health
Health check du serveur.

## Architecture

- **transactionService**: Logique métier avec gestion transactionnelle PostgreSQL
- **Idempotence**: Protection via `client_transaction_id` unique
- **Conversion GeoJSON ↔ WKT**: Pour compatibilité PostGIS
- **Soft delete**: Les features ne sont jamais physiquement supprimées
- **Versioning**: Chaque modification incrémente la version

## Sécurité

- Helmet.js pour headers sécurisés
- CORS configuré
- Validation des entrées
- Gestion d'erreurs centralisée
- Rate limiting recommandé en production
