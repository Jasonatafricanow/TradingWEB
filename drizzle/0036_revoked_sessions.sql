CREATE TABLE `revoked_sessions` (
 `token_hash` char(64) NOT NULL PRIMARY KEY,
 `expires_at` timestamp NOT NULL,
 KEY `revoked_sessions_expiry_idx` (`expires_at`)
);
