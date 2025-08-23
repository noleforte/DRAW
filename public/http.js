// Единый HTTP клиент для API
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('authToken');
  
  // Добавляем заголовки для принудительного обновления кэша
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opts.headers || {})
  };
  
  const response = await fetch(`https://draw-e67b.onrender.com${path}`, {
    credentials: 'include',
    headers: defaultHeaders,
    ...opts
  });
  
  return response;
}

// Экспортируем для использования в других файлах
window.apiFetch = apiFetch; 