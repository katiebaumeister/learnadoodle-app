/**
 * Typed command registry: schema → authorize → validate → preview → execute.
 * Mutation tools prepare commands only; execute() runs after user confirmation.
 */

/** @typedef {import('./types.js').DoodleCommand} DoodleCommand */
/** @typedef {import('./types.js').DoodleContext} DoodleContext */
/** @typedef {import('./types.js').PreviewField} PreviewField */
/** @typedef {import('./types.js').DoodleLink} DoodleLink */

/**
 * @typedef {Object} CommandHandler
 * @property {string} type
 * @property {(command: DoodleCommand) => { ok: boolean, error?: string }} schema
 * @property {(command: DoodleCommand, ctx: DoodleContext, caps: object) => { ok: boolean, error?: string }} authorize
 * @property {(command: DoodleCommand, ctx: DoodleContext) => Promise<{ ok: boolean, error?: string }>} validate
 * @property {(command: DoodleCommand, ctx: DoodleContext) => PreviewField[]} preview
 * @property {(command: DoodleCommand, ctx: DoodleContext) => Promise<{ ok: boolean, message: string, affectedRecords?: DoodleLink[], undoToken?: string, error?: string, resultData?: object }>} execute
 * @property {string} auditLabel
 */

/** @type {Record<string, CommandHandler>} */
const registry = Object.create(null);

/** @param {CommandHandler} handler */
export function registerCommand(handler) {
  if (!handler?.type) throw new Error('registerCommand: type required');
  registry[handler.type] = handler;
}

/** @param {string} type */
export function getCommand(type) {
  return registry[type] || null;
}

export function listCommands() {
  return Object.keys(registry);
}

/**
 * Revalidate + execute a confirmed command through the registry.
 * Never trust client payloads without re-running authorize/validate.
 */
export async function executeRegisteredCommand(command, ctx, caps = {}) {
  const type = command?.type;
  const handler = getCommand(type);
  if (!handler) {
    return {
      ok: false,
      message: `Unsupported command: ${type || '(missing)'}`,
      error: 'unsupported_command',
    };
  }

  const schemaResult = handler.schema(command);
  if (!schemaResult.ok) {
    return { ok: false, message: schemaResult.error || 'Invalid command', error: 'schema' };
  }

  const authResult = handler.authorize(command, ctx, caps);
  if (!authResult.ok) {
    return { ok: false, message: authResult.error || 'Not allowed', error: 'unauthorized' };
  }

  const validation = await handler.validate(command, ctx);
  if (!validation.ok) {
    return { ok: false, message: validation.error || 'Validation failed', error: 'validation' };
  }

  return handler.execute(command, ctx);
}
