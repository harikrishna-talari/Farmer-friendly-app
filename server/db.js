import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';

if (!process.env.MYSQL_URL) {
  throw new Error('MYSQL_URL is required. Copy .env.example to .env and add your external MySQL connection URL.');
}

const databaseUrl = new URL(process.env.MYSQL_URL);
if (!['mysql:', 'mariadb:'].includes(databaseUrl.protocol)) {
  throw new Error('MYSQL_URL must use the mysql:// or mariadb:// scheme.');
}
if (!databaseUrl.hostname || !databaseUrl.username || !databaseUrl.pathname.slice(1)) {
  throw new Error('MYSQL_URL must include a host, username, and database name.');
}

export const db = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.slice(1)),
  ssl: process.env.MYSQL_SSL === 'true'
    ? {
        rejectUnauthorized: true,
        ...(process.env.MYSQL_SSL_CA ? { ca: readFileSync(process.env.MYSQL_SSL_CA, 'utf8') } : {})
      }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const initialListings = [
  { id: 'CROP-101', title: 'Certified Organic Golden Durum Wheat', farmer: 'Oak Ridge Agronomics (John Miller)', farmLocation: 'Willamette Valley, OR', category: 'Grains', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80', price: 320, unit: 'Ton', availableQty: 45, minOrder: 2, harvestDate: 'Sep 18, 2026', moistureContent: '11.8%', rating: 4.9, reviewsCount: 38, organicCertified: true, description: 'High-protein durum wheat ideal for artisanal pasta and bread mills. Harvested under dry conditions and stored in climate-controlled silos.' },
  { id: 'CROP-102', title: 'Vine-Ripened Heirloom San Marzano Plum Tomatoes', farmer: 'SunValley Organic Farm (Maria Santos)', farmLocation: 'Central Valley, CA', category: 'Vegetables', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80', price: 1.85, unit: 'kg', availableQty: 2500, minOrder: 50, harvestDate: 'Fresh Picked Daily', moistureContent: 'High Brix (6.8)', rating: 4.8, reviewsCount: 52, organicCertified: true, description: 'Intense sweetness and low acidity. Hand-picked at peak ripeness for commercial kitchens and gourmet sauce makers.' },
  { id: 'CROP-103', title: 'Cold-Extracted Single-Estate Extra Virgin Olive Oil', farmer: 'Castillo Olive Groves', farmLocation: 'Sonoma County, CA', category: 'Oils & Specialty', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80', price: 9.20, unit: 'Liter', availableQty: 800, minOrder: 20, harvestDate: 'Early Harvest 2026', moistureContent: '<0.2% Acidity', rating: 5.0, reviewsCount: 29, organicCertified: true, description: 'First cold extraction within 4 hours of harvest. Peppery finish with notes of green artichoke and cut grass.' }
];

const initialOrders = [
  { id: 'ORD-771', cropId: 'CROP-101', title: 'Certified Organic Golden Durum Wheat', farmer: 'Oak Ridge Agronomics', quantity: 5, unit: 'Ton', totalCost: 1600, buyerName: 'Artisan Bakery Guild', status: 'In Transit (Truck #4)', orderDate: 'Sep 24, 2026' }
];

export async function initializeDatabase() {
  const connection = await db.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        email VARCHAR(254) NOT NULL UNIQUE,
        password_salt CHAR(32) NOT NULL,
        password_hash CHAR(128) NOT NULL,
        created_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash CHAR(64) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        expires_at BIGINT UNSIGNED NOT NULL,
        INDEX sessions_expiry_idx (expires_at),
        CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id VARCHAR(80) PRIMARY KEY,
        owner_id CHAR(36) NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX listings_owner_idx (owner_id),
        CONSTRAINT listings_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(80) PRIMARY KEY,
        owner_id CHAR(36) NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX orders_owner_idx (owner_id),
        CONSTRAINT orders_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const listing of initialListings) {
      await connection.execute(
        'INSERT IGNORE INTO listings (id, owner_id, payload) VALUES (?, NULL, ?)',
        [listing.id, JSON.stringify(listing)]
      );
    }
    for (const order of initialOrders) {
      await connection.execute(
        'INSERT IGNORE INTO orders (id, owner_id, payload) VALUES (?, NULL, ?)',
        [order.id, JSON.stringify(order)]
      );
    }
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}
