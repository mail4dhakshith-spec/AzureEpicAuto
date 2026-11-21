import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const request = http.request({ hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 3000 }, (response) => {
  if (response.statusCode === 200) {
    console.log(`Health check passed on port ${port}`);
    process.exit(0);
  }
  console.error(`Health check failed with status ${response.statusCode}`);
  process.exit(1);
});
request.on('timeout', () => request.destroy(new Error(`Timed out on port ${port}`)));
request.on('error', (error) => { console.error(error.message); process.exit(1); });
request.end();
