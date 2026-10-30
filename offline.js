let worker;
const controls = new Map();

function request(action, id, progress) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer); channel.port1.close();
      if (error) reject(new Error(error)); else resolve(result);
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('Download timed out. Please try again.'), 90000);
    };
    channel.port1.onmessage = ({ data }) => {
      if (data.progress) { reset(); progress?.(data.progress); }
      else finish(data.error, data.result);
    };
    reset();
    worker.postMessage({ action, id }, [channel.port2]);
  });
}

const savedIcon = '<svg class="saved-check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="m7 12 3.3 3.3L17 8.5"/></svg>';
const refreshIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/></svg>';

function render(control) {
  const { button, refreshButton, status, map, bytes, saved, updateAvailable, message } = control;
  button.disabled = refreshButton.disabled = control.busy;
  button.textContent = saved ? 'Remove' : '↓ Download';
  button.classList.toggle('remove-download', saved);
  button.setAttribute('aria-label', `${saved ? 'Remove offline download for' : 'Download'} ${map.name}${saved ? '' : ' for offline play'}`);
  refreshButton.hidden = !(saved && updateAvailable);
  refreshButton.innerHTML = refreshIcon + '<span>Refresh</span>';
  status.innerHTML = saved ? savedIcon + '<span>Saved</span>' : `${(bytes / 1e6).toFixed(1)} MB`;
  status.classList.toggle('offline-saved', saved);
  message.hidden = true;
  message.textContent = '';
}

export function addDownloadControl(card, map) {
  const footer = document.createElement('div');
  footer.className = 'map-download';
  const summary = document.createElement('div');
  summary.className = 'download-summary';
  const status = document.createElement('span');
  status.className = 'download-status';
  status.id = `download-status-${map.id}`;
  status.setAttribute('role', 'status');
  status.textContent = 'Checking downloads…';
  const message = document.createElement('span');
  message.className = 'download-message';
  message.setAttribute('role', 'status');
  message.hidden = true;
  summary.append(status, message);
  const actions = document.createElement('div');
  actions.className = 'download-actions';
  const button = document.createElement('button');
  button.className = 'download-button';
  button.dataset.downloadMap = map.id;
  button.textContent = '↓ Download';
  button.setAttribute('aria-label', `Download ${map.name} for offline play`);
  button.setAttribute('aria-describedby', status.id);
  button.disabled = true;
  const refreshButton = document.createElement('button');
  refreshButton.className = 'download-button refresh-download';
  refreshButton.dataset.refreshMap = map.id;
  refreshButton.setAttribute('aria-label', `Refresh offline download for ${map.name}`);
  refreshButton.title = 'A new version is available';
  refreshButton.hidden = true;
  actions.append(refreshButton, button);
  footer.append(summary, actions); card.append(footer);
  const control = { map, button, refreshButton, status, message, saved: false, updateAvailable: false, bytes: 0, busy: false };
  controls.set(map.id, control);
  const perform = async action => {
    control.busy = true;
    render(control);
    footer.classList.add('download-busy');
    const removing = action === 'remove', refreshing = action === 'refresh';
    const activeButton = refreshing ? refreshButton : button;
    activeButton.textContent = removing ? 'Removing…' : refreshing ? 'Refreshing…' : 'Downloading…';
    if (!removing) navigator.storage?.persist?.().catch(() => {});
    try {
      const result = await request(action, map.id, ({ done, total }) => {
        message.hidden = false;
        message.textContent = `${refreshing ? 'Refreshing' : 'Downloading'} ${done + 1} of ${total} files…`;
      });
      Object.assign(control, result);
      control.busy = false;
      render(control);
      window.dispatchEvent(new CustomEvent('offline-map-changed', { detail: { id: map.id } }));
    } catch (error) {
      control.busy = false;
      render(control);
      if (control.saved) {
        message.hidden = false;
        message.textContent = `${error.message} Saved copy kept.`;
      } else {
        status.textContent = error.message;
        button.textContent = 'Retry';
      }
    } finally {
      control.busy = false;
      footer.classList.remove('download-busy');
    }
  };
  button.addEventListener('click', () => perform(control.saved ? 'remove' : 'download'));
  refreshButton.addEventListener('click', () => perform('refresh'));
}

export async function initializeDownloads() {
  const help = document.getElementById('offline-help');
  try {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
      throw new Error('Offline downloads need a supported browser on HTTPS or localhost.');
    }
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Offline setup failed. Reload to try again.')), 30000)),
    ]);
    worker = ready.active;
    const refresh = async (check = false) => {
      const maps = await request(check ? 'check' : 'status');
      for (const map of maps) {
        const control = controls.get(map.id);
        if (control && !control.busy) { Object.assign(control, map, { map: control.map }); render(control); }
      }
    };
    await refresh();
    const check = () => refresh(true).catch(() => {});
    check();
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('hashchange', () => { if (!location.hash || location.hash === '#/') check(); });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      worker = navigator.serviceWorker.controller ?? worker;
      refresh().then(check).catch(() => {});
    });
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type !== 'offline-map-changed') return;
      window.dispatchEvent(new CustomEvent('offline-map-changed', { detail: { id: data.id } }));
      refresh().catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
    if (registration.waiting) help.textContent = 'App update ready. Close all Maps tabs and reopen to use it. Saved maps are kept.';
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          help.textContent = 'App update ready. Close all Maps tabs and reopen to use it. Saved maps are kept.';
        }
      });
    });
  } catch (error) {
    help.textContent = error.message;
    for (const { status, button } of controls.values()) {
      status.textContent = 'Offline saving unavailable'; button.textContent = 'Unavailable'; button.disabled = true;
    }
  }
}
