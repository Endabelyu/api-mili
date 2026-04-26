import { sendTelegramAlert } from './telegram';

/**
 * Simple structured JSON logger for improved production observability.
 * Replaces standard console.log with JSON payloads that logging agents can parse.
 */
export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => {
    console.info(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), msg, ...ctx }));
  },
  warn: (msg: string, ctx?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), msg, ...ctx }));
  },
  error: (msg: string, ctx?: Record<string, unknown>) => {
    const errorBody = JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), msg, ...ctx });
    console.error(errorBody);
    
    // Deterine the relevant topic ID based on source (FE vs BE)
    let topicId: string | undefined = process.env.TELEGRAM_TOPIC_BACKEND;
    if (ctx && ctx.source === 'frontend') {
      topicId = process.env.TELEGRAM_TOPIC_FRONTEND;
    }

    // Auto-forward critical SEV-1 errors to Telegram in the background without blocking execution
    sendTelegramAlert(
      `🚨 ERROR \n${msg}${ctx ? '\n\nContext:\n' + JSON.stringify(ctx, null, 2) : ''}`,
      true,
      topicId
    ).catch(fetchErr => console.warn('Silencing expected telegram failure to prevent log loop', fetchErr));
  },
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({ level: 'debug', timestamp: new Date().toISOString(), msg, ...ctx }));
    }
  }
};
