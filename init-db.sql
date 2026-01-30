-- Initialize databases
-- This script is automatically executed by Docker when the PostgreSQL container starts

-- Create main application database for development
CREATE DATABASE cinema_tickets 
  OWNER cinema 
  ENCODING 'UTF8';

-- Create test database
CREATE DATABASE cinema_tickets_test 
  OWNER cinema 
  ENCODING 'UTF8';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE cinema TO cinema;
GRANT ALL PRIVILEGES ON DATABASE cinema_tickets TO cinema;
GRANT ALL PRIVILEGES ON DATABASE cinema_tickets_test TO cinema;
