import { Hono } from 'hono';
import authApp from './auth';
import transactionsApp from './transactions';
import budgetsApp from './budgets';
import categoriesApp from './categories';
import reportsApp from './reports';
import exportApp from './export';
import consentApp from './consent';
import accountsApp from './accounts';
import calendarApp from './calendar';
import targetsApp from './targets';
import scheduledApp from './scheduled';
import notificationsApp from './notifications';
import ocrApp from './ocr';
import feedbacksApp from './feedbacks';
import analyticsApp from './analytics';

const apiRouter = new Hono()
  .route('/auth', authApp)
  .route('/transactions', transactionsApp)
  .route('/budgets', budgetsApp)
  .route('/categories', categoriesApp)
  .route('/reports', reportsApp)
  .route('/export', exportApp)
  .route('/accounts', accountsApp)
  .route('/calendar', calendarApp)
  .route('/targets', targetsApp)
  .route('/scheduled', scheduledApp)
  .route('/notifications', notificationsApp)
  .route('/consent', consentApp)
  .route('/ocr', ocrApp)
  .route('/feedbacks', feedbacksApp)
  .route('/analytics', analyticsApp);

export default apiRouter;
export type AppRoutes = typeof apiRouter;
