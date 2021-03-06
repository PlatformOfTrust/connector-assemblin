// Load environment variables.
import dotenv from 'dotenv';
import rp from 'request-promise';
dotenv.config();

/**
 * Module dependencies.
 */
import fs from 'fs';
import helmet from 'helmet';
import express, { NextFunction } from 'express';
import { logger } from './logger';
import bodyParser from 'body-parser';
import compression from 'compression';
import { GreenlockConfig, HttpError } from './types';
import http from 'http';
import { Request, Response } from 'express-serve-static-core';
import { appEndpoints } from './app/routes';
import GLE from 'greenlock-express';
import winston from 'winston/lib/winston/config';
import passport from "passport";
import passportInit from "./app/auth/passport";

// Initiate app.
const app = express();


/**
 * Express middleware.
 */
app.use(helmet());
app.use(compression());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Disable HTTP Header Fingerprinting
app.disable('x-powered-by');

passportInit(passport);

// Set up routes for app.
appEndpoints(app, passport);

// Catch 404 and forward to error handler.
app.use((request, response, next) => {
  let error = { status: 404, message: "Not found" };
  next(error);
});

// Set error handler for app.
app.use((error: HttpError, request: Request, response: Response, next: NextFunction) => {
  response.locals.message = error.message;
  let message = 'Internal Server Error.';
  switch (error.status) {
    case 400:
      message = 'Bad Request.';
      break;
    case 404:
      message = 'Not Found.';
      break;
  }
  response.status(error.status || 500).send({
    error: {
      status: error.status || 500,
      message: error.message
    }
  });
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT) : 8080;
const host = process.env.HOST || '0.0.0.0';

// Start HTTP server.
if (process.env.GREENLOCK_MAINTANER) {
  /**
   * Greenlock Express v4 configuration.
   */
  let config: GreenlockConfig = { sites: [] };
  const configDir = './greenlock.d';
  const configFile = configDir + '/config.json';
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);
  if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, JSON.stringify(config), 'utf8');

  // Configure domain.
  try {
    config = JSON.parse(fs.readFileSync(configFile).toString());
    if (config.sites.length === 0) {
      config.sites.push({
        subject: process.env.TRANSLATOR_DOMAIN,
        altnames: [process.env.TRANSLATOR_DOMAIN]
      });
      fs.writeFileSync(configFile, JSON.stringify(config), 'utf8');
    }
  } catch (err) {
    logger.log('error', err.message);
  }
  
  GLE.init({
    packageRoot: __dirname,
    configDir,
    maintainerEmail: process.env.GREENLOCK_MAINTANER,
    cluster: false
  }).serve(app);
} else {
  http.createServer(app)
    .listen(port, host, undefined, () => logger.log('info', `Connector API started on port: ${port}`))
}


