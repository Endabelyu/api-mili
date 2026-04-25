import { Hono } from 'hono';
import authApp from './auth';
import transactionsApp from './transactions';
import budgetsApp from './budgets';
import categoriesApp from './categories';
import reportsApp from './reports';
import exportApp from './export';
import consentApp from './consent';

const apiRouter = new Hono()
  .route('/auth', authApp)
  .route('/transactions', transactionsApp)
  .route('/budgets', budgetsApp)
  .route('/categories', categoriesApp)
  .route('/reports', reportsApp)
  .route('/export', exportApp)
  .route('/consent', consentApp);

export default apiRouter;
export type AppRoutes = typeof apiRouter;
