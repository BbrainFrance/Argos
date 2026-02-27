const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "cesium", "Build", "Cesium");
const dest = path.join(__dirname, "..", "public", "cesiumStatic");

function copyRecursive(source, target) {
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const dirs = ["Workers", "ThirdParty", "Assets", "Widgets"];
console.log("==> Copying Cesium static assets to public/cesiumStatic/...");
for (const dir of dirs) {
  const s = path.join(src, dir);
  const d = path.join(dest, dir);
  if (fs.existsSync(s)) {
    copyRecursive(s, d);
    console.log(`   Copied ${dir}`);
  } else {
    console.warn(`   WARNING: ${s} not found`);
  }
}
console.log("==> Cesium assets ready.");
