async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function getCurrentUser() {
  try {
    const { user } = await request('/api/auth/me');
    return user;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

export async function authenticate({ mode, name, email, password }) {
  const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const payload = mode === 'register' ? { name, email, password } : { email, password };
  const { user } = await request(endpoint, { method: 'POST', body: JSON.stringify(payload) });
  return user;
}

export const signOut = () => request('/api/auth/logout', { method: 'POST' });
export const getListings = async () => (await request('/api/listings')).listings;
export const getOrders = async () => (await request('/api/orders')).orders;
export const getPriceTrends = async () => (await request('/api/prices')).priceTrends;
export const getWeatherAdvisory = async () => (await request('/api/weather')).weatherAdvisory;

export const createListing = async (listing) => (
  await request('/api/listings', { method: 'POST', body: JSON.stringify(listing) })
).listing;

export const createOrder = async (order) => (
  await request('/api/orders', { method: 'POST', body: JSON.stringify(order) })
).order;
