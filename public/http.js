// Единый HTTP клиент для API
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(`https://draw-e67b.onrender.com${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    },
    ...opts
  });
  
  return response;
}

// Экспортируем для использования в других файлах
window.apiFetch = apiFetch; 