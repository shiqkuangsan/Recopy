-- Migrate theme default from 'dark' to 'system' for existing users
-- New installs also get 'dark' from 001_init.sql, then this migration updates it
UPDATE settings SET value = 'system' WHERE key = 'theme' AND value = 'dark';
