import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Configuration for XAMPP
const poolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "xiangqi_game",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  charset: "utf8mb4",
  multipleStatements: false,
};

console.log("🔌 Database Config (XAMPP):");
console.log(`   Host: ${poolConfig.host}`);
console.log(`   Port: ${poolConfig.port}`);
console.log(`   User: ${poolConfig.user}`);
console.log(`   Database: ${poolConfig.database}`);

// Create connection pool
let pool;
try {
  pool = mysql.createPool(poolConfig);
  console.log("✅ Connection pool created");
} catch (error) {
  console.error("❌ Failed to create connection pool:", error.message);
  process.exit(1);
}

/**
 * Test connection to existing database and auto-create tables if missing
 */
async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    // Test connection
    await connection.execute("SELECT 1");
    console.log("✅ Connected to database successfully");

    console.log("🔄 Running auto-migrations to ensure tables exist...");
    
    // Auto-create tables if they don't exist
    const sqlCommands = [
      `CREATE TABLE IF NOT EXISTS users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        status ENUM('active','inactive','banned') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS user_profiles (
        profile_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        full_name VARCHAR(100),
        avatar_url VARCHAR(255),
        gender ENUM('male','female','other') DEFAULT 'other',
        country VARCHAR(50),
        bio TEXT,
        rank VARCHAR(50) DEFAULT 'Novice',
        rank_points INT DEFAULT 0,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        draws INT DEFAULT 0,
        brightness INT DEFAULT 50,
        sound_enabled BOOLEAN DEFAULT TRUE,
        volume INT DEFAULT 50,
        auto_play BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS rooms (
        room_id INT PRIMARY KEY AUTO_INCREMENT,
        room_code VARCHAR(6) UNIQUE NOT NULL,
        host_user_id INT NOT NULL,
        guest_user_id INT NOT NULL,
        red_player_id INT NOT NULL,
        black_player_id INT NOT NULL,
        match_id INT,
        status ENUM('waiting_confirmation', 'playing', 'ended', 'closed') DEFAULT 'waiting_confirmation',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (host_user_id) REFERENCES users(user_id),
        FOREIGN KEY (guest_user_id) REFERENCES users(user_id),
        FOREIGN KEY (red_player_id) REFERENCES users(user_id),
        FOREIGN KEY (black_player_id) REFERENCES users(user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS matches (
        match_id INT PRIMARY KEY AUTO_INCREMENT,
        room_id INT NOT NULL,
        red_player_id INT NOT NULL,
        black_player_id INT NOT NULL,
        winner_id INT,
        result VARCHAR(20),
        turn_number INT DEFAULT 0,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id),
        FOREIGN KEY (red_player_id) REFERENCES users(user_id),
        FOREIGN KEY (black_player_id) REFERENCES users(user_id),
        FOREIGN KEY (winner_id) REFERENCES users(user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS moves (
        move_id INT PRIMARY KEY AUTO_INCREMENT,
        match_id INT NOT NULL,
        turn_number INT NOT NULL,
        player_id INT NOT NULL,
        from_pos VARCHAR(10),
        to_pos VARCHAR(10),
        move_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (match_id) REFERENCES matches(match_id),
        FOREIGN KEY (player_id) REFERENCES users(user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        message_id INT PRIMARY KEY AUTO_INCREMENT,
        room_id INT NOT NULL,
        sender_id INT NOT NULL,
        message_text TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(room_id),
        FOREIGN KEY (sender_id) REFERENCES users(user_id)
      )`
    ];

    for (const sql of sqlCommands) {
      await connection.execute(sql);
    }
    console.log("✅ Auto-migrations completed. All tables are ready.");

  } catch (error) {
    console.error("❌ Database connection error:", error.message);
    throw error;
  } finally {
    await connection.release();
  }
}

/**
 * Get database pool
 */
function getPool() {
  return pool;
}

/**
 * Get a connection from the pool
 */
async function getConnection() {
  return await pool.getConnection();
}

/**
 * Close all connections
 */
async function closePool() {
  await pool.end();
}

export { initializeDatabase, getPool, getConnection, closePool };
