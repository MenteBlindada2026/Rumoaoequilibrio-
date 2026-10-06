'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { createServer: createHttpServer } = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const siteDirectory = __dirname;
const defaultDatabasePath = path.join(siteDirectory, '..', 'data', 'surveys.sqlite');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function createDatabase(databasePath = defaultDatabasePath) {
  const resolvedPath = path.resolve(databasePath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new DatabaseSync(resolvedPath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS survey_invites (
      id INTEGER PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS survey_submissions (
      id INTEGER PRIMARY KEY,
      invite_id INTEGER NOT NULL UNIQUE REFERENCES survey_invites(id),
      answers_json TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS survey_clients (
      client_hash TEXT PRIMARY KEY,
      invite_id INTEGER NOT NULL UNIQUE REFERENCES survey_invites(id),
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.replaceAll('-', '').trim().toUpperCase();
  return /^[A-F0-9]{32}$/.test(normalized) ? normalized : null;
}

function normalizeClientId(clientId) {
  if (typeof clientId !== 'string') return null;
  const normalized = clientId.trim().toUpperCase();
  return /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/.test(normalized)
    ? normalized
    : null;
}

function hashCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

function issueInviteCode(database) {
  const code = randomBytes(16).toString('hex').toUpperCase();
  database.prepare(
    'INSERT INTO survey_invites (code_hash, created_at) VALUES (?, ?)'
  ).run(hashCode(code), new Date().toISOString());
  return code.match(/.{1,8}/g).join('-');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > 8192) {
    const error = new Error('Request body is too large.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function createServer({ database = createDatabase(), staticDirectory = siteDirectory } = {}) {
  const resolvedStaticDirectory = path.resolve(staticDirectory);
  const failedAccessAttempts = new Map();
  const registrationAttempts = new Map();

  function checkRateLimit(request, attempts, maxAttempts, windowMs) {
    const now = Date.now();
    const address = request.socket.remoteAddress || 'unknown';
    const record = attempts.get(address);
    if (record && record.resetAt > now && record.count >= maxAttempts) return false;
    if (!record || record.resetAt <= now) {
      attempts.set(address, { count: 1, resetAt: now + windowMs });
    } else {
      record.count += 1;
    }
    return true;
  }

  async function handleSurveyRegistration(request, response) {
    if (!checkRateLimit(request, registrationAttempts, 10, 24 * 60 * 60 * 1000)) {
      sendJson(response, 429, { error: 'Este navegador já atingiu o limite de novos códigos. Tente novamente amanhã.' });
      return;
    }
    const body = await readJson(request);
    const clientId = normalizeClientId(body.clientId);
    if (!clientId) {
      sendJson(response, 400, { error: 'Identificador deste navegador inválido. Recarregue a página e tente novamente.' });
      return;
    }

    const clientHash = hashCode(clientId);
    const code = randomBytes(16).toString('hex').toUpperCase();
    const createdAt = new Date().toISOString();
    database.exec('BEGIN IMMEDIATE');
    try {
      const existingClient = database.prepare(
        'SELECT invite_id FROM survey_clients WHERE client_hash = ?'
      ).get(clientHash);
      if (existingClient) {
        database.exec('ROLLBACK');
        sendJson(response, 409, { error: 'Este navegador já recebeu um código individual.' });
        return;
      }

      const inviteResult = database.prepare(
        'INSERT INTO survey_invites (code_hash, created_at) VALUES (?, ?)'
      ).run(hashCode(code), createdAt);
      const inviteId = Number(inviteResult.lastInsertRowid);
      database.prepare(
        'INSERT INTO survey_clients (client_hash, invite_id, created_at) VALUES (?, ?, ?)'
      ).run(clientHash, inviteId, createdAt);
      database.exec('COMMIT');
      sendJson(response, 201, { code: code.match(/.{1,8}/g).join('-') });
    } catch (error) {
      database.exec('ROLLBACK');
      if (error.code === 'ERR_SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
        sendJson(response, 409, { error: 'Este navegador já recebeu um código individual.' });
        return;
      }
      throw error;
    }
  }

  function getInvite(code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) return null;
    return database.prepare(
      'SELECT id, used_at FROM survey_invites WHERE code_hash = ?'
    ).get(hashCode(normalizedCode));
  }

  async function handleSurveyAccess(request, response) {
    if (!checkRateLimit(request, failedAccessAttempts, 30, 15 * 60 * 1000)) {
      sendJson(response, 429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
      return;
    }
    const body = await readJson(request);
    const invite = getInvite(body.code);
    if (!invite) {
      sendJson(response, 404, { error: 'Código não encontrado.' });
      return;
    }
    if (invite.used_at) {
      sendJson(response, 409, { error: 'Este código já foi usado.' });
      return;
    }
    sendJson(response, 200, { available: true });
  }

  async function handleSurveySubmission(request, response) {
    const body = await readJson(request);
    const normalizedCode = normalizeCode(body.code);
    const answers = body.answers;
    const questionNames = ['q1', 'q2', 'q3', 'q4', 'q5'];
    if (
      !normalizedCode ||
      !answers ||
      typeof answers !== 'object' ||
      Array.isArray(answers) ||
      Object.keys(answers).length !== questionNames.length ||
      !questionNames.every((question) =>
        Object.hasOwn(answers, question) &&
        (answers[question] === 0 || answers[question] === 1)
      )
    ) {
      sendJson(response, 400, { error: 'Responda todas as perguntas com valores válidos.' });
      return;
    }

    const codeHash = hashCode(normalizedCode);
    const score = questionNames.reduce((total, question) => total + answers[question], 0);
    const createdAt = new Date().toISOString();

    database.exec('BEGIN IMMEDIATE');
    try {
      const invite = database.prepare(
        'SELECT id, used_at FROM survey_invites WHERE code_hash = ?'
      ).get(codeHash);
      if (!invite) {
        database.exec('ROLLBACK');
        sendJson(response, 404, { error: 'Código não encontrado.' });
        return;
      }
      if (invite.used_at) {
        database.exec('ROLLBACK');
        sendJson(response, 409, { error: 'Este código já foi usado.' });
        return;
      }

      database.prepare(`
        INSERT INTO survey_submissions (invite_id, answers_json, score, created_at)
        VALUES (?, ?, ?, ?)
      `).run(invite.id, JSON.stringify(answers), score, createdAt);
      database.prepare(
        'UPDATE survey_invites SET used_at = ? WHERE id = ? AND used_at IS NULL'
      ).run(createdAt, invite.id);
      database.exec('COMMIT');
      sendJson(response, 201, { saved: true });
    } catch (error) {
      database.exec('ROLLBACK');
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE') {
        sendJson(response, 409, { error: 'Este código já foi usado.' });
        return;
      }
      throw error;
    }
  }

  function serveStatic(request, response, pathname) {
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      sendJson(response, 400, { error: 'Endereço inválido.' });
      return;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const filePath = path.resolve(resolvedStaticDirectory, relativePath);
    if (!filePath.startsWith(`${resolvedStaticDirectory}${path.sep}`)) {
      sendJson(response, 404, { error: 'Arquivo não encontrado.' });
      return;
    }

    try {
      if (!statSync(filePath).isFile()) {
        sendJson(response, 404, { error: 'Arquivo não encontrado.' });
        return;
      }
      const body = readFileSync(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': body.length,
        'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        sendJson(response, 404, { error: 'Arquivo não encontrado.' });
        return;
      }
      throw error;
    }
  }

  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      if (
        requestUrl.pathname === '/api/survey/register' ||
        requestUrl.pathname === '/api/survey/access' ||
        requestUrl.pathname === '/api/survey/submit'
      ) {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          sendJson(response, 405, { error: 'Método não permitido.' });
          return;
        }
        if (!request.headers['content-type']?.startsWith('application/json')) {
          sendJson(response, 415, { error: 'Envie os dados como JSON.' });
          return;
        }
        if (requestUrl.pathname === '/api/survey/register') {
          await handleSurveyRegistration(request, response);
        } else if (requestUrl.pathname === '/api/survey/access') {
          await handleSurveyAccess(request, response);
        } else {
          await handleSurveySubmission(request, response);
        }
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendJson(response, 405, { error: 'Método não permitido.' });
        return;
      }
      serveStatic(request, response, requestUrl.pathname);
    } catch (error) {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error('Erro ao processar requisição:', error);
      sendJson(response, 500, { error: 'Erro interno do servidor.' });
    }
  });
}

if (require.main === module) {
  const database = createDatabase(process.env.DB_PATH || defaultDatabasePath);
  const server = createServer({ database });
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`Site iniciado em http://${host}:${port}`);
    console.log(`Banco de dados SQLite: ${process.env.DB_PATH || defaultDatabasePath}`);
  });
  const shutdown = () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createDatabase, createServer, issueInviteCode, normalizeClientId, normalizeCode };
