"""Simple HTTP server with correct MIME types for ES modules.

Usage: python serve.py [port]
Default port: 8000

Windows Registry may override .js MIME type to text/plain,
which prevents ES module loading. This script forces text/javascript
and adds no-cache headers to avoid stale content issues.
"""

import http.server
import mimetypes
import sys

# Force correct MIME types BEFORE the server starts.
# On Windows, mimetypes.init() reads the Registry and may set .js to text/plain.
mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('application/wasm', '.wasm')

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def guess_type(self, path):
        # Force .js to text/javascript regardless of Windows Registry
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'text/javascript'
        return super().guess_type(path)

print(f'Serving on http://localhost:{PORT}')
print(f'MIME type for .js: {mimetypes.guess_type("test.js")[0]}')
http.server.HTTPServer(('', PORT), Handler).serve_forever()
