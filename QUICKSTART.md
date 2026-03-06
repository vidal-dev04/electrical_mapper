# 🚀 Guide de démarrage rapide

## Option 1 : Avec Docker (Recommandé)

### 1. Démarrer PostgreSQL/PostGIS

```bash
# Dans le dossier racine du projet
docker-compose up -d

# Vérifier que la base de données est prête
docker-compose logs postgres
```

### 2. Configurer le backend

```bash
cd backend

# Créer le fichier .env
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/electrical_network" > .env
echo "PORT=3000" >> .env
echo "NODE_ENV=development" >> .env

# Installer les dépendances
npm install

# Initialiser la base de données
npm run init-db

# Démarrer le serveur
npm run dev
```

Vous devriez voir :
```
✅ Database initialized successfully with PostGIS extension
🚀 Server running on port 3000
```

### 3. Lancer l'application mobile

**Dans un nouveau terminal :**

```bash
cd mobile

# Installer les dépendances
npm install

# Démarrer Expo
npm start
```

Ensuite :
- Appuyez sur `a` pour Android
- Appuyez sur `i` pour iOS
- Scannez le QR code avec l'app Expo Go sur votre tablette

### 4. Configuration réseau pour tablette

**IMPORTANT** : Pour connecter votre tablette au backend :

1. Trouvez votre IP locale :
   ```bash
   # Windows
   ipconfig
   # Cherchez "Adresse IPv4" (ex: 192.168.1.100)
   ```

2. Modifiez `mobile/services/TransactionQueue.js` ligne 83 :
   ```javascript
   getApiUrl() {
     return 'http://192.168.1.100:3000'; // Votre IP locale
   }
   ```

3. Assurez-vous que votre PC et tablette sont sur le même réseau WiFi

## Option 2 : Sans Docker

### 1. Installer PostgreSQL avec PostGIS

**Windows :**
1. Télécharger PostgreSQL depuis https://www.postgresql.org/download/windows/
2. Pendant l'installation, inclure "Stack Builder" et installer PostGIS
3. Créer la base de données :
   ```sql
   CREATE DATABASE electrical_network;
   \c electrical_network
   CREATE EXTENSION postgis;
   ```

### 2. Suite identique

Suivez les étapes 2-4 de l'Option 1 ci-dessus.

## 🧪 Tester le système

### Test de la transaction queue

1. Lancez l'application sur votre tablette
2. Dessinez quelques features (lignes, points, polygones)
3. Observez l'indicateur de sync en haut à droite
4. **Désactivez le WiFi sur la tablette**
5. Continuez à dessiner
6. **Réactivez le WiFi**
7. Les transactions en attente devraient se synchroniser automatiquement ✅

### Vérifier dans la base de données

```bash
docker exec -it electrical-network-db psql -U postgres -d electrical_network

# Voir toutes les features
SELECT id, feature_type, ST_AsText(geometry), properties 
FROM electrical_features 
WHERE deleted_at IS NULL;

# Voir l'historique des transactions
SELECT * FROM sync_transactions 
ORDER BY created_at DESC 
LIMIT 10;
```

## 📱 Utilisation sur le terrain

### Bonnes pratiques

1. **Avant de partir** :
   - Vérifiez que l'app se synchronise correctement
   - Notez l'IP de votre serveur si vous avez une connexion 4G

2. **Sur le terrain** :
   - L'app fonctionne en mode offline
   - Toutes les modifications sont enregistrées localement
   - La sync se fait automatiquement quand la connexion revient

3. **Après le terrain** :
   - Connectez-vous au WiFi
   - Attendez que toutes les transactions soient synchronisées (compteur à 0)
   - Vérifiez les données dans la base

### Indicateurs de l'interface

- **✓ Synchronisé (0 en attente)** → Tout est sauvegardé
- **⏳ Synchronisation... (X en attente)** → Upload en cours
- **⚠ Erreur de synchro (X en attente)** → Problème réseau, réessayera automatiquement

## 🔧 Dépannage

### Le serveur ne démarre pas
```bash
# Vérifier que PostgreSQL est accessible
docker-compose ps

# Voir les logs
docker-compose logs -f postgres
```

### L'app mobile ne se connecte pas au serveur
1. Vérifiez que le backend est démarré
2. Testez l'API : `http://votre-ip:3000/health` dans un navigateur
3. Vérifiez le pare-feu Windows (autoriser port 3000)

### Réinitialiser complètement

```bash
# Arrêter et supprimer la base de données
docker-compose down -v

# Redémarrer
docker-compose up -d

# Réinitialiser la DB
cd backend
npm run init-db
```

## 📊 Monitoring

### Voir les stats de sync

```sql
-- Nombre de features par type
SELECT feature_type, COUNT(*) 
FROM electrical_features 
WHERE deleted_at IS NULL 
GROUP BY feature_type;

-- Transactions des dernières 24h
SELECT 
  operation,
  status,
  COUNT(*) 
FROM sync_transactions 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY operation, status;

-- Clients actifs
SELECT 
  client_id,
  COUNT(*) as transactions,
  MAX(created_at) as last_activity
FROM sync_transactions
GROUP BY client_id;
```

## 🎯 Prochaines étapes

1. **Personnaliser les types de features** :
   - Modifier les propriétés dans `map.html`
   - Ajouter des attributs spécifiques (voltage, matériau, etc.)

2. **Ajouter l'authentification** :
   - Implémenter JWT dans le backend
   - Ajouter login dans l'app mobile

3. **Export de données** :
   - Ajouter endpoint `/api/export/geojson`
   - Générer des fichiers Shapefile

4. **Mode complètement offline** :
   - Pré-charger les tuiles de carte
   - Sync différée quand connexion disponible

---

**Bon mapping ! ⚡🗺️**
