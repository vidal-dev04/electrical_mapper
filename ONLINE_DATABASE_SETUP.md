# 🌐 Configuration base de données PostgreSQL en ligne

Au lieu d'installer PostgreSQL localement, vous pouvez utiliser une base de données hébergée.

## 📋 Option 1 : Supabase (RECOMMANDÉ)

### Avantages
- ✅ **Gratuit** jusqu'à 500 MB
- ✅ **PostGIS inclus** par défaut
- ✅ Dashboard web pour visualiser les données
- ✅ API REST automatique (bonus)
- ✅ Backups automatiques

### Setup (5 minutes)

**1. Créer un compte**
```
https://supabase.com/dashboard/sign-up
```

**2. Créer un projet**
- Cliquer "New Project"
- Nom : `electrical-network-mapper`
- Database Password : Choisir un mot de passe fort
- Région : Choisir la plus proche (ex: Frankfurt pour Europe)

**3. Activer PostGIS**
Dans le projet → SQL Editor → Nouvelle requête :
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**4. Récupérer la connection string**
- Settings → Database
- Copier "Connection String" sous "URI"
- Remplacer `[YOUR-PASSWORD]` par votre mot de passe

Exemple :
```
postgresql://postgres:VotreMdp123@db.abcdefghijk.supabase.co:5432/postgres
```

**5. Configurer le backend**
```bash
cd backend

# Créer .env
echo "DATABASE_URL=postgresql://postgres:VotreMdp@db.xxx.supabase.co:5432/postgres" > .env
echo "PORT=3000" >> .env
echo "NODE_ENV=development" >> .env

# Initialiser la base
npm run init-db

# Démarrer
npm run dev
```

**6. Vérifier dans Supabase**
- Table Editor → Voir `electrical_features`, `sync_transactions`
- SQL Editor → Tester : `SELECT * FROM electrical_features;`

---

## 📋 Option 2 : Neon (Serverless)

### Avantages
- ✅ **Gratuit** jusqu'à 10 GB
- ✅ Serverless (scale automatique)
- ✅ PostGIS supporté
- ✅ Très rapide

### Setup

**1. Créer compte**
```
https://neon.tech
```

**2. Créer projet**
- New Project → `electrical-network-mapper`
- Region : Choisir la plus proche

**3. Activer PostGIS**
Dans Console → SQL Editor :
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**4. Copier connection string**
- Dashboard → Connection Details
- Copier la "Connection string"

Exemple :
```
postgresql://user:password@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

**5. Configurer backend**
```bash
cd backend
# Utiliser la connection string de Neon dans .env
DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require
```

---

## 📋 Option 3 : Railway (Deploy complet)

### Avantages
- ✅ **$5 crédit gratuit/mois**
- ✅ Deploy backend + DB en 1 click
- ✅ PostGIS supporté

### Setup

**1. Créer compte**
```
https://railway.app
```

**2. Nouveau projet**
- New Project → Deploy PostgreSQL
- Attendre provisioning

**3. Ajouter PostGIS**
Variables → Add → Extension :
```
postgresql_extension=postgis
```

Ou via SQL :
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**4. Copier connection string**
- Database → Connect → Connection URL

**5. (BONUS) Déployer le backend aussi**
- Add Service → GitHub Repo
- Connecter votre repo
- Variables : Ajouter `DATABASE_URL` (référence à la DB)

---

## 🔧 Configuration générale

### Modifier backend/.env

```bash
# Remplacer localhost par votre URL en ligne
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]

# Le reste identique
PORT=3000
NODE_ENV=development
```

### Vérifier la connexion

```bash
cd backend
npm run init-db
```

Vous devriez voir :
```
✅ Database initialized successfully with PostGIS extension
```

### Configurer le pool de connexions (production)

`backend/src/db/pool.js` - Ajouter SSL pour DB en ligne :

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 📊 Comparaison des options

| Provider | Free Tier | PostGIS | Dashboard | SSL | Backups |
|----------|-----------|---------|-----------|-----|---------|
| **Supabase** | 500 MB | ✅ Inclus | ✅ Excellent | ✅ Auto | ✅ Quotidiens |
| **Neon** | 10 GB | ✅ Extension | ✅ Bon | ✅ Auto | ✅ Point-in-time |
| **Railway** | $5/mois | ✅ Extension | ⚠️ Basique | ✅ Auto | ⚠️ Manuel |
| **Render** | 90 jours | ✅ Extension | ⚠️ Basique | ✅ Auto | ⚠️ Payant |

---

## 🚀 Avantages base de données en ligne

### Pour développement
- ✅ **Pas d'installation locale** (Docker non nécessaire)
- ✅ **Même DB pour toute l'équipe** (synchronisation facile)
- ✅ **Accessible depuis tablette** directement

### Pour production
- ✅ **Backups automatiques**
- ✅ **Scalabilité** (montée en charge)
- ✅ **Monitoring** intégré
- ✅ **Sécurité** (SSL, firewall)
- ✅ **Maintenance** gérée par le provider

---

## 🔒 Sécurité

### Variables d'environnement

**❌ JAMAIS** :
```javascript
// Ne JAMAIS hardcoder la connection string
const pool = new Pool({
  connectionString: 'postgresql://user:password@host/db'
});
```

**✅ TOUJOURS** :
```javascript
// Toujours via variable d'environnement
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
```

### Gitignore

Vérifier que `.env` est dans `.gitignore` :
```bash
cat .gitignore | grep .env
```

### Accès IP (Supabase)

Par défaut, Supabase accepte toutes les IPs. Pour restreindre :
- Settings → Database → Network Restrictions
- Ajouter IPs autorisées

---

## 🧪 Test de connexion

### Script de test rapide

`backend/test-connection.js` :
```javascript
import pool from './src/db/pool.js';

const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW(), PostGIS_Version()');
    console.log('✅ Connexion réussie !');
    console.log('Heure serveur:', result.rows[0].now);
    console.log('PostGIS version:', result.rows[0].postgis_version);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur connexion:', error.message);
    process.exit(1);
  }
};

testConnection();
```

Exécuter :
```bash
node backend/test-connection.js
```

---

## 💡 Recommandation finale

Pour votre projet de cartographie terrain :

**Développement** : **Supabase** (gratuit, facile, PostGIS inclus)
**Production** : **Supabase** ou **Neon** (selon volume de données)

Avec Supabase, vous avez aussi :
- Dashboard pour voir les tracés en temps réel
- API REST automatique (bonus pour futures fonctionnalités)
- Authentication prête si besoin plus tard

---

## 🆘 Troubleshooting

### Erreur "FATAL: no pg_hba.conf entry"
→ Ajouter `?sslmode=require` à la connection string

### Erreur "Extension postgis does not exist"
→ Exécuter `CREATE EXTENSION postgis;` dans SQL Editor

### Timeout de connexion
→ Vérifier que l'IP n'est pas bloquée (firewall provider)

### Pool exhausted
→ Augmenter `max` dans pool.js ou réduire le nombre de connexions

---

**Plus besoin de Docker ni PostgreSQL local !** 🎉
