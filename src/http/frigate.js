const { postJson, requestJson } = require('./client');

function trimTrailingSlash(url) {
  if (!url) return url;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function encodePath(value) {
  return encodeURIComponent(value || '').replace(/%2F/g, '/');
}

function safeJsonParse(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch (err) {
    return null;
  }
}

function makeFrigateClient({
  baseUrl,
  enabled = true,
  cameraName,
  label,
  durationSeconds,
  remoteRoleHeader,
  retainOnComplete,
}, logger = console) {
  if (!enabled || !baseUrl) {
    return {
      async startEvent() { return null; },
      async annotateEvent() { return false; },
      async endEvent() { return false; },
    };
  }

  const trimmedBase = trimTrailingSlash(baseUrl);
  const defaultHeaders = {};
  if (remoteRoleHeader) defaultHeaders['remote-role'] = remoteRoleHeader;

  async function startEvent(meta = {}) {
    const camera = meta.cameraName || cameraName;
    const eventLabel = meta.label || label || 'transaction';
    if (!camera || !eventLabel) {
      logger.warn?.('frigate: missing camera or label, skipping event creation');
      return null;
    }

    const url = `${trimmedBase}/api/events/${encodePath(camera)}/${encodePath(eventLabel)}/create`;
    const payload = {};
    const duration = meta.durationSeconds ?? durationSeconds;
    if (Number.isFinite(duration) && duration > 0) {
      payload.duration = duration;
    }

    try {
      const response = await postJson(url, payload, defaultHeaders);
      const data = safeJsonParse(response.body);
      const eventId = meta.eventId || data?.event_id || data?.id || (typeof data?.event_id === 'number' ? String(data.event_id) : data?.event_id);
      const resolvedId = eventId ? String(eventId) : null;
      const eventUrl = data?.event_url || (resolvedId ? `${trimmedBase}/api/events/${encodePath(resolvedId)}` : null);
      if (!resolvedId) {
        logger.warn?.('frigate: event id missing from create response');
        return null;
      }
      return { eventId: resolvedId, eventUrl, camera, label: eventLabel };
    } catch (err) {
      logger.warn?.(`frigate: failed to create event – ${err.message}`);
      return null;
    }
  }

  async function annotateEvent(eventId, { subLabel, description, retain } = {}) {
    if (!eventId) return false;
    const tasks = [];

    if (subLabel) {
      const subLabelUrl = `${trimmedBase}/api/events/${encodePath(eventId)}/sub_label`;
      tasks.push(
        requestJson(subLabelUrl, {
          method: 'POST',
          body: { subLabel },
          headers: defaultHeaders,
        }).catch((err) => {
          logger.warn?.(`frigate: sub_label failed – ${err.message}`);
        })
      );
    }

    if (description) {
      const descriptionUrl = `${trimmedBase}/api/events/${encodePath(eventId)}/description`;
      tasks.push(
        requestJson(descriptionUrl, {
          method: 'POST',
          body: { description },
          headers: defaultHeaders,
        }).catch((err) => {
          logger.warn?.(`frigate: description failed – ${err.message}`);
        })
      );
    }

    if (retain || retainOnComplete) {
      const retainUrl = `${trimmedBase}/api/events/${encodePath(eventId)}/retain`;
      tasks.push(
        requestJson(retainUrl, {
          method: 'POST',
          headers: defaultHeaders,
        }).catch((err) => {
          logger.warn?.(`frigate: retain failed – ${err.message}`);
        })
      );
    }

    if (tasks.length === 0) return true;
    await Promise.all(tasks);
    return true;
  }

  async function endEvent(eventId) {
    if (!eventId) return false;
    const url = `${trimmedBase}/api/events/${encodePath(eventId)}/end`;
    try {
      await requestJson(url, { method: 'PUT', body: {}, headers: defaultHeaders });
      return true;
    } catch (err) {
      logger.warn?.(`frigate: failed to end event – ${err.message}`);
      return false;
    }
  }

  return { startEvent, annotateEvent, endEvent };
}

module.exports = { makeFrigateClient };
