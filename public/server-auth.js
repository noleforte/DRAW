// Server-based authentication system for Royale Ball
class ServerAuthSystem {
  constructor() {
    this.currentUser = null;
    this.accessToken = localStorage.getItem('authToken');
    // Use Render server URL for production, localhost for development
    this.serverUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001' 
      : 'https://draw-e67b.onrender.com';
    
    // Добавляем защиту от спама
    this.validateInFlight = null;
    this.lastValidateAt = 0;
    this.failCount = 0;
    
    this.init();
  }

  // Единый валидатор с защитой от спама
  async validateToken() {
    if (!this.accessToken) {
      throw new Error('NO_TOKEN');
    }
    
    const now = Date.now();
    // Не чаще раза в 10 секунд
    if (now - this.lastValidateAt < 10000 && this.validateInFlight) {
      return this.validateInFlight;
    }
    
    this.validateInFlight = (async () => {
      try {
        const response = await fetch(`${this.serverUrl}/api/auth/me`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.status === 401 || response.status === 403) {
          // Это действительно проблема токена → выходим из аккаунта
          console.log('❌ Token invalid, logging out');
          this.logout();
          throw new Error('AUTH_DENIED');
        }
        
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        
        const data = await response.json();
        this.lastValidateAt = Date.now();
        this.failCount = 0;
        
        if (data.success) {
          this.currentUser = data.user;
          console.log('✅ Token validated, user authenticated:', data.user.nickname);
          return true;
        }
        
        return false;
      } catch (error) {
        // На сетевые ошибки НЕ делаем logout, просто откладываем повтор
        if (error.message === 'AUTH_DENIED') {
          throw error;
        }
        
        this.failCount++;
        const backoff = Math.min(16000, 1000 * Math.pow(2, this.failCount - 1));
        console.log(`⚠️ Validation failed, retrying in ${backoff}ms (attempt ${this.failCount})`);
        
        // Просто пауза между повторами
        setTimeout(() => {}, backoff);
        throw error;
      } finally {
        this.validateInFlight = null;
      }
    })();
    
    return this.validateInFlight;
  }

  async checkCORSStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      return response.ok;
    } catch (error) {
      console.warn('⚠️ CORS check failed:', error.message);
      return false;
    }
  }

  async init() {
    if (this.accessToken) {
      try {
        await this.validateToken();
      } catch (error) {
        console.warn('⚠️ CORS check failed, server may not be ready yet');
        this.logout();
      }
    }
  }

  async login(email, nickname, password) {
    // Проверяем, что переданы оба обязательных поля
    if (!nickname || !password) {
      throw new Error('MISSING_CREDENTIALS: nickname and password are required');
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ nickname, password }) // Убираем email - сервер его не ожидает
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          this.accessToken = data.token;
          this.currentUser = data.user;
          localStorage.setItem('authToken', data.token);
          
          console.log('✅ Login successful:', data.user.nickname);
          return { success: true, user: data.user };
        } else {
          throw new Error(data.error || 'Login failed');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    }
  }

  async register(email, nickname, password, wallet) {
    try {
      const response = await fetch(`${this.serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, nickname, password, wallet }) // Возвращаем email - сервер его ожидает
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          this.accessToken = data.token;
          this.currentUser = data.user;
          localStorage.setItem('authToken', data.token);
          
          console.log('✅ Registration successful:', data.user.nickname);
          return { success: true, user: data.user };
        } else {
          throw new Error(data.error || 'Registration failed');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }
    } catch (error) {
      console.error('❌ Registration error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      if (this.accessToken) {
        await fetch(`${this.serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ Logout request failed:', error);
    } finally {
      this.currentUser = null;
      this.accessToken = null;
      localStorage.removeItem('authToken');
      console.log('✅ User logged out');
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // Добавляем недостающий метод для совместимости
  getCurrentUserSync() {
    return this.currentUser;
  }

  isAuthenticated() {
    return !!this.currentUser && !!this.accessToken;
  }
}

const serverAuth = new ServerAuthSystem();
window.serverAuth = serverAuth; 