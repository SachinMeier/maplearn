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

function render(control) {
  const { button, status, map, bytes, saved } = control;
  button.disabled = false;
  button.textContent = saved ? 'Remove' : '↓ Download';
  button.setAttribute('aria-label', `${saved ? 'Remove offline download for' : 'Download'} ${map.name}${saved ? '' : ' for offline play'}`);
  status.textContent = saved ? '✓ Available offline' : `${(bytes / 1e6).toFixed(1)} MB`;
  status.classList.toggle('offline-saved', saved);
}

export function addDownloadControl(card, map) {
  const footer = document.createElement('div');
  footer.className = 'map-download';
  const status = document.createElement('span');
  status.className = 'download-status';
  status.id = `download-status-${map.id}`;
  status.setAttribute('role', 'status');
  status.textContent = 'Checking downloads…';
  const button = document.createElement('button');
  button.className = 'download-button';
  button.dataset.downloadMap = map.id;
  button.textContent = '↓ Download';
  button.setAttribute('aria-label', `Download ${map.name} for offline play`);
  button.setAttribute('aria-describedby', status.id);
  button.disabled = true;
  footer.append(status, button); card.append(footer);
  const control = { map, button, status, saved: false, bytes: 0, busy: false };
  controls.set(map.id, control);
  button.addEventListener('click', async () => {
    control.busy = true; button.disabled = true;
    const removing = control.saved;
    button.textContent = removing ? 'Removing…' : 'Downloading…';
    status.textContent = removing ? 'Removing offline copy…' : 'Starting download…';
    // Persistence is optional; denial never prevents a download.
    if (!removing) navigator.storage?.persist?.().catch(() => {});
    try {
      const result = await request(removing ? 'remove' : 'download', map.id, ({ done, total }) => {
        status.textContent = `Downloading ${done + 1} of ${total} files…`;
      });
      control.saved = result.saved;
      render(control);
    } catch (error) {
      render(control);
      status.textContent = error.message;
      button.textContent = 'Retry';
    } finally { control.busy = false; }
  });
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
    const refresh = async () => {
      const maps = await request('status');
      for (const map of maps) {
        const control = controls.get(map.id);
        if (control && !control.busy) { Object.assign(control, map, { map: control.map }); render(control); }
      }
    };
    await refresh();
    window.addEventListener('focus', () => refresh().catch(() => {}));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh().catch(() => {});
    });
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          help.textContent = 'Update ready. Close all Maps tabs and reopen to use it. Your downloads will be kept.';
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
