const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'nightfall.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS stats (
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, game)
  );
`);

const stmtUpsertWin = db.prepare(`
  INSERT INTO stats (user_id, game, wins) VALUES (?, ?, 1)
  ON CONFLICT(user_id, game) DO UPDATE SET wins = wins + 1
`);
const stmtUpsertLoss = db.prepare(`
  INSERT INTO stats (user_id, game, losses) VALUES (?, ?, 1)
  ON CONFLICT(user_id, game) DO UPDATE SET losses = losses + 1
`);
const stmtUpsertDraw = db.prepare(`
  INSERT INTO stats (user_id, game, draws) VALUES (?, ?, 1)
  ON CONFLICT(user_id, game) DO UPDATE SET draws = draws + 1
`);
const stmtGetStats = db.prepare(
  'SELECT * FROM stats WHERE user_id = ?'
);
const stmtLeaderboard = db.prepare(
  'SELECT user_id, SUM(wins) as total_wins, SUM(losses) as total_losses FROM stats GROUP BY user_id ORDER BY total_wins DESC LIMIT 10'
);
const stmtGameLeaderboard = db.prepare(
  'SELECT user_id, wins, losses, draws FROM stats WHERE game = ? ORDER BY wins DESC LIMIT 10'
);

function addWin(userId, game) { stmtUpsertWin.run(userId, game); }
function addLoss(userId, game) { stmtUpsertLoss.run(userId, game); }
function addDraw(userId, game) { stmtUpsertDraw.run(userId, game); }
function getUserStats(userId) { return stmtGetStats.all(userId); }
function getLeaderboard() { return stmtLeaderboard.all(); }
function getGameLeaderboard(game) { return stmtGameLeaderboard.all(game); }

module.exports = {
  db, addWin, addLoss, addDraw, getUserStats, getLeaderboard, getGameLeaderboard,
};
