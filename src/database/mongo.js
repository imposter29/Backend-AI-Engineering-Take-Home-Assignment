/**
 * MongoDB connection manager.
 *
 * Exposes a single `connectMongo()` for boot and `disconnectMongo()`
 * for graceful shutdown. Lifecycle events are surfaced through the
 * shared logger so connection drops are visible in production.
 *
 * Both the API server and the BullMQ worker need DB access — both
 * call connectMongo() at startup.
 */

import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'mongo' });

mongoose.set('strictQuery', true);

let connectionPromise = null;

export const connectMongo = async () => {
  if (connectionPromise) return connectionPromise;

  log.info('connecting to MongoDB', { uri: redactUri(config.mongo.uri) });

  connectionPromise = mongoose
    .connect(config.mongo.uri, {
      dbName: config.mongo.dbName,
      // Sensible defaults — tune per environment if needed.
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      minPoolSize: 2,
    })
    .then((conn) => {
      log.info('MongoDB connected', {
        host: conn.connection.host,
        db: conn.connection.name,
      });
      return conn;
    })
    .catch((err) => {
      log.error('MongoDB connection failed', { err });
      connectionPromise = null;
      throw err;
    });

  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => log.error('MongoDB error', { err }));

  return connectionPromise;
};

export const disconnectMongo = async () => {
  if (mongoose.connection.readyState === 0) return;
  log.info('disconnecting MongoDB');
  await mongoose.disconnect();
  connectionPromise = null;
};

const redactUri = (uri) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
