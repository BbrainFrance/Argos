#!/bin/bash
set -e

echo "==> Copying assets to standalone..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "==> Cleaning node_modules (keeping only prisma for migrations)..."
mkdir -p /tmp/_prisma_backup
cp -r node_modules/prisma /tmp/_prisma_backup/prisma
cp -r node_modules/@prisma /tmp/_prisma_backup/@prisma
cp -r node_modules/.prisma /tmp/_prisma_backup/.prisma 2>/dev/null || true

rm -rf node_modules .next/cache
mkdir -p node_modules

mv /tmp/_prisma_backup/prisma node_modules/prisma
mv /tmp/_prisma_backup/@prisma node_modules/@prisma
mv /tmp/_prisma_backup/.prisma node_modules/.prisma 2>/dev/null || true
rm -rf /tmp/_prisma_backup

echo "==> Postbuild cleanup complete!"
