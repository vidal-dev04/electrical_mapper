import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      verifyToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch('https://electrical-network-backend.onrender.com/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setLoading(false);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Token verification error:', error);
      logout();
    }
  };

  const login = async (username, password) => {
    try {
      const response = await fetch('https://electrical-network-backend.onrender.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        localStorage.removeItem('userName');
        localStorage.removeItem('client_id');

        return { success: true };
      } else {
        return { success: false, error: data.error || 'Erreur de connexion' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Erreur de connexion au serveur' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    setLoading(false);
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isSuperviseur: user?.role === 'superviseur'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
