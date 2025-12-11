import winston from 'winston';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for simple logging
const simpleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
  transports: [
    // Console transport
    new winston.transports.Console({
      format:
        config.logging.format === 'json'
          ? combine(json())
          : combine(colorize(), simpleFormat),
    }),
  ],
});

// Add file transport if configured
if (config.logging.file) {
  logger.add(
    new winston.transports.File({
      filename: config.logging.file,
      format: combine(json()),
    })
  );
}

