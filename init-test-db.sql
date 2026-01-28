-- Initialize test database
-- This script is automatically executed by Docker when the PostgreSQL container starts

-- Create test database if it doesn't exist
DO
$$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_database 
        WHERE datname = 'cinema_tickets_test'
    ) THEN
        CREATE DATABASE cinema_tickets_test 
        OWNER cinema 
        ENCODING 'UTF8' 
        LC_COLLATE 'en_US.UTF-8' 
        LC_CTYPE 'en_US.UTF-8';
    END IF;
END
$$;

-- Grant privileges to cinema user on test database
GRANT ALL PRIVILEGES ON DATABASE cinema_tickets_test TO cinema;
