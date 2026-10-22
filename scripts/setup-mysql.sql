-- Safe, credential-free database bootstrap for ActorConsole.
--
-- This file intentionally does not create or alter a user: passwords must be
-- supplied out-of-band. Prefer scripts/setup-mysql.sh, which accepts
-- MYSQL_APP_PASSWORD and writes a mode-0600 temporary client configuration.
--
-- Manual user setup (replace the placeholders interactively; do not commit
-- the resulting values):
--   CREATE USER 'actorconsole'@'localhost' IDENTIFIED WITH mysql_native_password BY '<password>';
--   GRANT ALL PRIVILEGES ON `actorconsole`.* TO 'actorconsole'@'localhost';

CREATE DATABASE IF NOT EXISTS `actorconsole`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

SELECT 'ActorConsole database created. Run setup-mysql.sh to configure credentials.' AS status;
