CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(64) UNIQUE,
  full_name VARCHAR(64) NOT NULL,
  birthday DATE,
  password_hash VARCHAR(255) NOT NULL,
  phone_number VARCHAR(15),
  position VARCHAR(64),
  role VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
