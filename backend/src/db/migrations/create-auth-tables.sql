-- Migration : Système d'authentification
-- Créer les tables users et activity_logs

-- Table users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('agent', 'superviseur')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- Index sur username pour performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Table activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- Ajouter colonne user_id à electrical_features
ALTER TABLE electrical_features 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_electrical_features_user_id ON electrical_features(user_id);

-- Insérer les 3 utilisateurs
-- Passwords hashés avec bcrypt (rounds=10):
-- agent1: Agent1234@ → $2b$10$vK6xYw8rGH0qHjPmE0Kc5OXqMZjKp9LNwQz4VhN7Gx5FtE8mKdWDy
-- agent2: Agent2026! → $2b$10$nF4tL3wQd8zPjRx9M2Bh7e8YpKvN5CmW1JnD6HqT4SrG9LxA2ZeUi
-- superviseur: SuperviseurMapp@2026 → $2b$10$pR7sH1vF9cKwL5nT3XdO8u6BqJ2WmY4IhZ8GxE1NrC7VpA3MfK9Se

INSERT INTO users (username, password_hash, full_name, role) VALUES
  ('agent1', '$2b$10$vK6xYw8rGH0qHjPmE0Kc5OXqMZjKp9LNwQz4VhN7Gx5FtE8mKdWDy', 'Agent 1', 'agent'),
  ('agent2', '$2b$10$nF4tL3wQd8zPjRx9M2Bh7e8YpKvN5CmW1JnD6HqT4SrG9LxA2ZeUi', 'Agent 2', 'agent'),
  ('superviseur', '$2b$10$pR7sH1vF9cKwL5nT3XdO8u6BqJ2WmY4IhZ8GxE1NrC7VpA3MfK9Se', 'Superviseur', 'superviseur')
ON CONFLICT (username) DO NOTHING;

-- Log de migration
INSERT INTO activity_logs (user_id, action, details) 
VALUES (NULL, 'system_migration', '{"description": "Auth system initialized"}');
