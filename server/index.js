import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Credential: use serviceAccountKey.json in this folder (easiest on Windows),
// otherwise fall back to the FIREBASE_* values in .env
function loadCredential() {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(file)) {
    return admin.credential.cert(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
    .trim()
    .replace(/,$/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n');
  return admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  });
}
admin.initializeApp({ credential: loadCredential() });

// One row per user per storage key (keeps documents small, no dotted-key problems)
const schema = new mongoose.Schema(
  { uid: { type: String, required: true }, key: { type: String, required: true }, value: { type: String, default: '' } },
  { timestamps: true }
);
schema.index({ uid: 1, key: 1 }, { unique: true });
const Entry = mongoose.model('Entry', schema);

const auth = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
};

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Load everything saved for this user
app.get('/api/state', auth, async (req, res) => {
  const rows = await Entry.find({ uid: req.user.uid }).lean();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

// Save changed keys: { changes: { "whitehouse:v1:inv": "[...]" } }
app.put('/api/state', auth, async (req, res) => {
  const changes = req.body?.changes || {};
  const ops = Object.entries(changes)
    .filter(([key]) => key.startsWith('whitehouse:v1'))
    .map(([key, value]) => ({
      updateOne: { filter: { uid: req.user.uid, key }, update: { $set: { value: String(value) } }, upsert: true },
    }));
  if (ops.length) await Entry.bulkWrite(ops);
  res.json({ ok: true, saved: ops.length });
});

// Serve the built React app in production
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../client/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

await mongoose.connect(process.env.MONGODB_URI);
app.listen(process.env.PORT || 5000, () => console.log('API running on port ' + (process.env.PORT || 5000)));