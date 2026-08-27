self.addEventListener('message', (event) => {
  const port = event.ports && event.ports[0];
  const url = event.data && event.data.url;
  const send = (status, extra) => {
    if (port) port.postMessage({ status: status, extra: extra || '' });
  };
  if (!url) {
    send('THROW', 'missing url');
    return;
  }
  try {
    const socket = new WebSocket(url);
    socket.onopen = () => send('OPEN');
    socket.onerror = () => send('ERROR');
  } catch (err) {
    send('THROW', String(err && err.message ? err.message : err));
  }
});
