// Dead since before Phase 2. The regex literals in this file were themselves
// mojibake-corrupted (e.g. /dup\/g/ which matches the literal string "dup/g")
// so the script never matched anything in real Romanian text. Replaced with
// a no-op stub. Safe to delete in a future cleanup PR once CDN caches rotate.
