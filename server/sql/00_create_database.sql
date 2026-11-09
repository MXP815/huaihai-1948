-- 首次部署：创建库与专用账号（需要管理员权限执行一次）
-- 用法（把 <PASSWORD> 换成你自己定的密码，不要把真实密码提交到仓库）：
--   mysql -uroot -p < server/sql/00_create_database.sql
-- 若不想单独建账号，可跳过本文件，直接用已有账号连接 hx1948 库。

CREATE DATABASE IF NOT EXISTS hx1948
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- 可选：专用账号，只给 hx1948 库权限
-- CREATE USER IF NOT EXISTS 'hx_app'@'127.0.0.1' IDENTIFIED BY '<PASSWORD>';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON hx1948.* TO 'hx_app'@'127.0.0.1';
-- FLUSH PRIVILEGES;
