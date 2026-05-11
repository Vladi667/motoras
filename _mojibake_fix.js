#!/usr/bin/env node
// Node CLI tool that performed a one-shot mojibake repair of HTML files
// during the pre-Phase-1 cleanup. Not loaded by any HTML page. The
// supplier-gateway pipeline (lib/api/catalog/types.js) now does the same
// normalization at gateway response time. Kept as an empty stub so any
// orphaned reference produces no output instead of running the obsolete
// 530-line repair script.
process.exit(0);
