#!/bin/bash
set -e

echo "==> Copying assets to standalone..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

echo "==> Removing build cache..."
rm -rf .next/cache

echo "==> Stripping package.json to runtime-only deps (prisma for migrations)..."
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json','utf8'));
p.dependencies = {
  prisma: p.dependencies.prisma,
  '@prisma/client': p.dependencies['@prisma/client'],
  '@prisma/adapter-pg': p.dependencies['@prisma/adapter-pg'],
  pg: p.dependencies.pg,
  dotenv: p.dependencies.dotenv
};
p.devDependencies = {};
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
"

echo "==> Postbuild complete! npm prune will now remove unused packages."
